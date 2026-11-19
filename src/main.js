import './styles/tokens.css';
import './styles/main.css';

import { feature as topoToFeature } from 'topojson-client';
import { POWER_META, STEPS } from './data/narrative.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { MapView } from './map/MapView.js';
import { PROJECTION_OPTIONS } from './map/projections.js';
import { Controls } from './ui/Controls.js';
import {
  SPEED_MS,
  SettingsDrawer,
  loadSettings,
  saveSettings,
} from './ui/SettingsDrawer.js';

async function bootstrap() {
  const settings = loadSettings();
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.colorMode = settings.colorMode || 'byPower';

  const appShellEl = document.getElementById('app-shell');
  const mapContainerEl = document.getElementById('map-container');
  const tooltipEl = document.getElementById('map-tooltip');
  const mobileInspectEl = document.getElementById('mobile-inspect-card');
  const meterEl = document.getElementById('area-meter');
  const narrativeEl = document.getElementById('narrative-deck');
  const timelineEl = document.getElementById('timeline-bar');
  const drawerEl = document.getElementById('settings-drawer');
  const backdropEl = document.getElementById('drawer-backdrop');
  const infoModalEl = document.getElementById('info-modal');

  // 全螢幕 HUD 元素
  const fsStatusTitleEl = document.getElementById('fs-status-title');
  const fsStatusQuoteEl = document.getElementById('fs-status-quote');
  const fsStatusStatsEl = document.getElementById('fs-status-stats');
  const fsBtnPrev = document.getElementById('fs-btn-prev');
  const fsBtnPlay = document.getElementById('fs-btn-play');
  const fsBtnNext = document.getElementById('fs-btn-next');
  const fsBtnExit = document.getElementById('fs-btn-exit');
  const fsCountryDock = document.getElementById('fs-country-dock');
  const fsDockToggle = document.getElementById('fs-dock-toggle');
  const fsCountryScroll = document.getElementById('fs-country-scroll');

  const [topoRes, metaRes] = await Promise.all([
    fetch('./data/world-1900.topo.json'),
    fetch('./data/world-1900-meta.json'),
  ]);
  if (!topoRes.ok || !metaRes.ok) {
    throw new Error('無法載入 1900 年地圖資料檔');
  }
  const [topoData, meta] = await Promise.all([topoRes.json(), metaRes.json()]);
  const geo = topoToFeature(topoData, topoData.objects.regions);

  const sound = new SoundEngine();
  sound.setEnabled(settings.soundEnabled);

  const appState = {
    settings,
    viewMode: 'sequence', // 'sequence' | 'solo'
    soloPowerId: null,
    activeStepIndex: 0,
    isPlaying: false,
    isFullscreen: false,
    fsDockCollapsed: false,
    revealStage: 'all',
    pulseNonce: 0,
  };

  let playTimer = null;
  let twoStageTimer = null;
  let lastFsCount = -1;

  const getMaxStepCount = () => (appState.settings.powerMode === 'historical11' ? 12 : 9);

  const mapView = new MapView({
    containerEl: mapContainerEl,
    tooltipEl,
    mobileInspectEl,
    features: geo.features,
    meta,
    steps: STEPS,
  });

  const controls = new Controls({
    meterEl,
    narrativeEl,
    timelineEl,
    steps: STEPS,
    meta,
    onSelectSoloCountry: (powerId) => selectSoloCountry(powerId),
    onTogglePlay: () => {
      if (appState.isPlaying) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    },
    onPrev: () => goPrevFromUi(),
    onNext: () => goNextFromUi(),
    onReplay: () => replaySequence(),
  });

  const settingsDrawer = new SettingsDrawer({
    drawerEl,
    backdropEl,
    infoModalEl,
    meta,
    initialSettings: appState.settings,
    onChange: (nextSettings) => applySettings(nextSettings),
  });

  function clearTimers() {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    if (twoStageTimer) {
      clearTimeout(twoStageTimer);
      twoStageTimer = null;
    }
  }

  function syncFullscreenRotation() {
    if (!appState.isFullscreen) {
      appShellEl.classList.remove('is-rotated-landscape');
      return;
    }
    const isPortrait = window.innerHeight > window.innerWidth;
    appShellEl.classList.toggle('is-rotated-landscape', isPortrait);
  }

  async function enterFullscreen() {
    appState.isFullscreen = true;
    appShellEl.classList.add('is-map-fullscreen');
    syncFullscreenRotation();
    requestAnimationFrame(() => {
      mapView.refreshLayout({ resetZoom: true });
    });

    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // iOS Safari 等不支援元素全螢幕時靜默退回 CSS 全螢幕
    }

    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // 不支援方向鎖定或未在允許全螢幕環境時，自動改由 CSS 橫屏旋轉接手
    }

    if (!appState.isFullscreen) return;
    syncFullscreenRotation();
    requestAnimationFrame(() => {
      mapView.refreshLayout({ resetZoom: true });
      setTimeout(() => {
        if (!appState.isFullscreen) return;
        syncFullscreenRotation();
        mapView.refreshLayout({ resetZoom: true });
      }, 120);
    });
  }

  async function exitFullscreen() {
    appState.isFullscreen = false;
    appShellEl.classList.remove('is-map-fullscreen', 'is-rotated-landscape');

    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch {
      // ignore
    }

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }

    requestAnimationFrame(() => {
      mapView.refreshLayout({ resetZoom: true });
    });
  }

  function renderFullscreenHud() {
    const maxStepCount = getMaxStepCount();
    const visibleSteps = STEPS.slice(0, maxStepCount);
    const isSolo = appState.viewMode === 'solo' && Boolean(appState.soloPowerId);
    const curStep = isSolo
      ? POWER_META[appState.soloPowerId] || visibleSteps[0]
      : visibleSteps[appState.activeStepIndex] || visibleSteps[0];

    const { globalLandKm2, powers } = meta;
    const scopeText = appState.settings.territoryScope === 'metropoleOnly' ? '本土' : '含屬地';

    if (isSolo) {
      const pStats = powers[curStep.id];
      const km2 =
        curStep.id === 'qing'
          ? pStats?.totalKm2 || 0
          : appState.settings.territoryScope === 'metropoleOnly'
            ? pStats?.metropoleKm2 || 0
            : pStats?.totalKm2 || 0;
      const wan = Math.round(km2 / 10_000).toLocaleString();
      const pct = ((km2 / globalLandKm2) * 100).toFixed(1);
      fsStatusTitleEl.textContent = `單國版圖檢視・${curStep.nameZh}`;
      fsStatusQuoteEl.textContent = curStep.quote;
      fsStatusStatsEl.textContent = `1900 面積 (${scopeText})：${wan} 萬 km²（佔全球 ${pct}%）`;
      fsBtnPrev.disabled = true;
      fsBtnNext.disabled = false;
      fsBtnPlay.textContent = '▶ 宣戰';
      fsBtnPlay.classList.remove('is-playing');
    } else {
      let declaredKm2 = 0;
      for (let i = 1; i <= appState.activeStepIndex && i < visibleSteps.length; i++) {
        const p = powers[visibleSteps[i].id];
        if (!p) continue;
        declaredKm2 +=
          appState.settings.territoryScope === 'metropoleOnly' ? p.metropoleKm2 : p.totalKm2;
      }
      const qingKm2 = powers.qing?.totalKm2 || 1;
      const declWan = Math.round(declaredKm2 / 10_000).toLocaleString();
      const declPct = ((declaredKm2 / globalLandKm2) * 100).toFixed(1);
      const ratio = (declaredKm2 / qingKm2).toFixed(1);
      const totalEnemies = visibleSteps.length - 1;

      fsStatusTitleEl.textContent =
        appState.activeStepIndex === 0
          ? `宣戰前夕・${curStep.nameZh}`
          : `宣戰順序 ${appState.activeStepIndex} / ${totalEnemies}・${curStep.nameZh}`;
      fsStatusQuoteEl.textContent = curStep.quote;
      fsStatusStatsEl.textContent =
        appState.activeStepIndex === 0
          ? `大清版圖：${Math.round(qingKm2 / 10_000).toLocaleString()} 萬 km²（8.5%）`
          : `已宣戰 ${appState.activeStepIndex} 國：${declWan} 萬 km²（${declPct}%）・比 1 : ${ratio}`;

      fsBtnPrev.disabled = appState.activeStepIndex <= 0;
      fsBtnNext.disabled = appState.activeStepIndex >= visibleSteps.length - 1;
      if (appState.isPlaying) {
        fsBtnPlay.textContent = '⏸ 暫停';
        fsBtnPlay.classList.add('is-playing');
      } else if (appState.activeStepIndex >= visibleSteps.length - 1) {
        fsBtnPlay.textContent = '↺ 重播';
        fsBtnPlay.classList.remove('is-playing');
      } else {
        fsBtnPlay.textContent = '▶ 宣戰';
        fsBtnPlay.classList.remove('is-playing');
      }
    }

    if (lastFsCount !== visibleSteps.length) {
      fsCountryScroll.innerHTML = '';
      visibleSteps.forEach((step) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'timeline-pill';
        if (step.isHistoricalExtra) btn.classList.add('is-extra');
        btn.dataset.powerId = step.id;
        btn.innerHTML = `<span class="country-dot power-${step.id}"></span><span>${step.shortLabel}</span>`;
        btn.addEventListener('click', () => selectSoloCountry(step.id));
        fsCountryScroll.appendChild(btn);
      });
      lastFsCount = visibleSteps.length;
    }

    const fsPills = fsCountryScroll.querySelectorAll('.timeline-pill');
    fsPills.forEach((btn, idx) => {
      const pid = btn.dataset.powerId;
      btn.classList.toggle('is-solo-selected', isSolo && pid === appState.soloPowerId);
      btn.classList.toggle('is-in-sequence', !isSolo && idx <= appState.activeStepIndex);
    });
  }

  function renderAll() {
    const maxStepCount = getMaxStepCount();
    if (appState.activeStepIndex >= maxStepCount) {
      appState.activeStepIndex = maxStepCount - 1;
    }
    if (
      appState.viewMode === 'solo' &&
      appState.soloPowerId &&
      !STEPS.slice(0, maxStepCount).some((s) => s.id === appState.soloPowerId)
    ) {
      appState.viewMode = 'sequence';
      appState.soloPowerId = null;
      appState.activeStepIndex = 0;
    }

    mapView.update({
      projectionId: appState.settings.projectionId,
      centerId: appState.settings.centerId,
      territoryScope: appState.settings.territoryScope,
      showSoutheastPact: appState.settings.showSoutheastPact,
      showCapitals: appState.settings.showCapitals,
      viewMode: appState.viewMode,
      soloPowerId: appState.soloPowerId,
      activeStepIndex: appState.activeStepIndex,
      maxStepCount,
      revealStage: appState.revealStage,
      pulseNonce: appState.pulseNonce,
    });

    controls.update({
      viewMode: appState.viewMode,
      soloPowerId: appState.soloPowerId,
      activeStepIndex: appState.activeStepIndex,
      maxStepCount,
      isPlaying: appState.isPlaying,
      projectionId: appState.settings.projectionId,
      territoryScope: appState.settings.territoryScope,
      showSoutheastPact: appState.settings.showSoutheastPact,
      powerMode: appState.settings.powerMode,
      colorMode: appState.settings.colorMode || 'byPower',
    });

    renderFullscreenHud();
    syncTopBar();
  }

  function selectSoloCountry(powerId) {
    clearTimers();
    appState.isPlaying = false;

    if (appState.viewMode === 'solo' && appState.soloPowerId === powerId) {
      // 再點一次已選取的單國按鈕，回到宣戰演繹起點（大清）
      appState.viewMode = 'sequence';
      appState.soloPowerId = null;
      appState.activeStepIndex = 0;
      appState.revealStage = 'all';
      appState.pulseNonce += 1;
      sound.playStepTick();
      renderAll();
      return;
    }

    appState.viewMode = 'solo';
    appState.soloPowerId = powerId;
    appState.activeStepIndex = 0;
    appState.revealStage = 'all';
    appState.pulseNonce += 1;
    sound.playStepTick();
    renderAll();
  }

  function goToStep(targetIdx, { animateTwoStage = true, playSound = true } = {}) {
    if (twoStageTimer) {
      clearTimeout(twoStageTimer);
      twoStageTimer = null;
    }
    appState.viewMode = 'sequence';
    appState.soloPowerId = null;

    const maxIdx = getMaxStepCount() - 1;
    const clamped = Math.max(0, Math.min(maxIdx, targetIdx));
    const prevIdx = appState.activeStepIndex;
    appState.activeStepIndex = clamped;
    appState.pulseNonce += 1;

    const shouldTwoStage =
      animateTwoStage &&
      clamped > 0 &&
      appState.settings.twoStageAnimation &&
      appState.settings.territoryScope === 'all';

    appState.revealStage = shouldTwoStage ? 'metropole' : 'all';

    if (playSound) {
      if (clamped === 0 || clamped < prevIdx) {
        sound.playStepTick();
      } else if (clamped === 8) {
        sound.playWarDrum(1.1);
        setTimeout(() => sound.playGong(), 160);
      } else {
        sound.playWarDrum(1.0);
      }
    }

    renderAll();

    if (shouldTwoStage) {
      twoStageTimer = setTimeout(() => {
        appState.revealStage = 'all';
        renderAll();
        if (playSound) {
          sound.playEmpireSpread();
        }
      }, 420);
    }
  }

  function goPrevFromUi() {
    stopAutoPlay();
    if (appState.viewMode === 'solo') return;
    if (appState.activeStepIndex > 0) {
      goToStep(appState.activeStepIndex - 1, { animateTwoStage: false, playSound: true });
    }
  }

  function goNextFromUi() {
    stopAutoPlay();
    if (appState.viewMode === 'solo') {
      goToStep(0, { animateTwoStage: false, playSound: true });
      return;
    }
    const maxIdx = getMaxStepCount() - 1;
    if (appState.activeStepIndex < maxIdx) {
      goToStep(appState.activeStepIndex + 1, { animateTwoStage: true, playSound: true });
    }
  }

  function replaySequence() {
    stopAutoPlay();
    goToStep(0, { animateTwoStage: false, playSound: true });
    startAutoPlay();
  }

  function scheduleNextTick() {
    if (!appState.isPlaying) return;
    const maxIdx = getMaxStepCount() - 1;
    if (appState.activeStepIndex >= maxIdx) {
      appState.isPlaying = false;
      renderAll();
      return;
    }
    const delay = SPEED_MS[appState.settings.playbackSpeed] || 3000;
    playTimer = setTimeout(() => {
      if (!appState.isPlaying) return;
      const nextIdx = appState.activeStepIndex + 1;
      goToStep(nextIdx, { animateTwoStage: true, playSound: true });
      scheduleNextTick();
    }, delay);
  }

  function startAutoPlay() {
    const maxIdx = getMaxStepCount() - 1;
    if (appState.viewMode === 'solo' || appState.activeStepIndex >= maxIdx) {
      goToStep(0, { animateTwoStage: false, playSound: true });
      appState.isPlaying = true;
      renderAll();
      playTimer = setTimeout(() => {
        if (!appState.isPlaying) return;
        goToStep(1, { animateTwoStage: true, playSound: true });
        scheduleNextTick();
      }, 1000);
      return;
    }

    appState.isPlaying = true;
    if (appState.activeStepIndex === 0) {
      renderAll();
      playTimer = setTimeout(() => {
        if (!appState.isPlaying) return;
        goToStep(1, { animateTwoStage: true, playSound: true });
        scheduleNextTick();
      }, 950);
    } else {
      renderAll();
      scheduleNextTick();
    }
  }

  function stopAutoPlay() {
    appState.isPlaying = false;
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    renderAll();
  }

  function applySettings(nextSettings) {
    const speedChanged = nextSettings.playbackSpeed !== appState.settings.playbackSpeed;
    appState.settings = { ...nextSettings };
    document.documentElement.dataset.theme = appState.settings.theme;
    document.documentElement.dataset.colorMode = appState.settings.colorMode || 'byPower';
    sound.setEnabled(appState.settings.soundEnabled);
    saveSettings(appState.settings);
    settingsDrawer.syncExternal(appState.settings);

    if (speedChanged && appState.isPlaying) {
      clearTimers();
      appState.revealStage = 'all';
      scheduleNextTick();
    }
    renderAll();
  }

  // 頂部捷徑控制
  const btnQuickMode = document.getElementById('btn-quick-mode');
  const btnQuickProj = document.getElementById('btn-quick-proj');
  const btnQuickTheme = document.getElementById('btn-quick-theme');
  const btnQuickSound = document.getElementById('btn-quick-sound');
  const btnOpenInfo = document.getElementById('btn-open-info');
  const btnOpenSettings = document.getElementById('btn-open-settings');

  function syncTopBar() {
    const s = appState.settings;
    btnQuickMode.textContent = s.powerMode === 'historical11' ? '史實 11 國' : '劇版 8 國';
    btnQuickMode.classList.toggle('is-active', s.powerMode === 'historical11');

    const projMeta = PROJECTION_OPTIONS.find((p) => p.id === s.projectionId);
    btnQuickProj.textContent =
      s.projectionId === 'mercator'
        ? '投影：Mercator（失真對照）'
        : `投影：${projMeta?.shortLabel || 'Equal Earth'}`;
    btnQuickProj.classList.toggle('is-active', s.projectionId === 'mercator');

    btnQuickTheme.querySelector('.btn-icon-glyph').textContent =
      s.theme === 'parchment' ? '🕯️' : '📜';
    btnQuickTheme.title =
      s.theme === 'parchment' ? '切換為深色電影特展風' : '切換為復古羊皮紙輿圖風';

    btnQuickSound.querySelector('.btn-icon-glyph').textContent = s.soundEnabled ? '🔊' : '🔇';
    btnQuickSound.title = s.soundEnabled ? '關閉音效' : '開啟音效';
  }

  btnQuickMode.addEventListener('click', () => {
    applySettings({
      ...appState.settings,
      powerMode: appState.settings.powerMode === 'drama8' ? 'historical11' : 'drama8',
    });
  });

  btnQuickProj.addEventListener('click', () => {
    applySettings({
      ...appState.settings,
      projectionId: appState.settings.projectionId === 'mercator' ? 'equalEarth' : 'mercator',
    });
  });

  btnQuickTheme.addEventListener('click', () => {
    applySettings({
      ...appState.settings,
      theme: appState.settings.theme === 'cinema' ? 'parchment' : 'cinema',
    });
  });

  btnQuickSound.addEventListener('click', () => {
    applySettings({
      ...appState.settings,
      soundEnabled: !appState.settings.soundEnabled,
    });
  });

  btnOpenInfo.addEventListener('click', () => settingsDrawer.openInfo());
  btnOpenSettings.addEventListener('click', () => settingsDrawer.open());

  // 縮放與全螢幕綁定
  document.getElementById('btn-zoom-in').addEventListener('click', () => mapView.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click', () => mapView.zoomOut());
  document.getElementById('btn-zoom-reset').addEventListener('click', () => mapView.resetZoom());
  document.getElementById('btn-enter-fullscreen').addEventListener('click', () => enterFullscreen());

  fsBtnExit.addEventListener('click', () => exitFullscreen());
  fsBtnPrev.addEventListener('click', () => goPrevFromUi());
  fsBtnNext.addEventListener('click', () => goNextFromUi());
  fsBtnPlay.addEventListener('click', () => {
    if (appState.isPlaying) stopAutoPlay();
    else startAutoPlay();
  });

  fsDockToggle.addEventListener('click', () => {
    appState.fsDockCollapsed = !appState.fsDockCollapsed;
    fsCountryDock.classList.toggle('is-collapsed', appState.fsDockCollapsed);
    fsDockToggle.setAttribute('aria-expanded', String(!appState.fsDockCollapsed));
    fsDockToggle.textContent = appState.fsDockCollapsed ? '各國版圖 ▴' : '收合 ▾';
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && appState.isFullscreen) {
      // 若使用者按系統返回鍵退出原生全螢幕，一併退出全螢幕 UI
      appState.isFullscreen = false;
      appShellEl.classList.remove('is-map-fullscreen', 'is-rotated-landscape');
      requestAnimationFrame(() => mapView.refreshLayout({ resetZoom: true }));
    }
  });

  const handleViewportChange = () => {
    if (!appState.isFullscreen) return;
    syncFullscreenRotation();
    requestAnimationFrame(() => mapView.refreshLayout({ resetZoom: false }));
  };
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);

  // 鍵盤快速操作
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape' && appState.isFullscreen && !settingsDrawer.isOpen && !settingsDrawer.isInfoOpen) {
      exitFullscreen();
    } else if (e.key === 'ArrowRight') {
      goNextFromUi();
    } else if (e.key === 'ArrowLeft') {
      goPrevFromUi();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (appState.isPlaying) stopAutoPlay();
      else startAutoPlay();
    }
  });

  renderAll();
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('map-container');
  if (el) {
    el.innerHTML = `<div style="padding:24px;color:#b91c1c;">地圖載入失敗：${err.message}</div>`;
  }
});
