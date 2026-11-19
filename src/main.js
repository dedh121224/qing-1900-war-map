import './styles/tokens.css';
import './styles/main.css';

import { feature as topoToFeature } from 'topojson-client';
import { STEPS } from './data/narrative.js';
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

  const mapContainerEl = document.getElementById('map-container');
  const tooltipEl = document.getElementById('map-tooltip');
  const mobileInspectEl = document.getElementById('mobile-inspect-card');
  const meterEl = document.getElementById('area-meter');
  const narrativeEl = document.getElementById('narrative-deck');
  const timelineEl = document.getElementById('timeline-bar');
  const drawerEl = document.getElementById('settings-drawer');
  const backdropEl = document.getElementById('drawer-backdrop');
  const infoModalEl = document.getElementById('info-modal');
  const legendPersonalEl = document.getElementById('legend-personal');
  const legendSoutheastEl = document.getElementById('legend-southeast');

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
    activeStepIndex: 0,
    isPlaying: false,
    revealStage: 'all',
    pulseNonce: 0,
  };

  let playTimer = null;
  let twoStageTimer = null;

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
    onStepChange: (idx) => {
      stopAutoPlay();
      const forward = idx > appState.activeStepIndex;
      goToStep(idx, { animateTwoStage: forward, playSound: true });
    },
    onTogglePlay: () => {
      if (appState.isPlaying) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    },
    onPrev: () => {
      stopAutoPlay();
      if (appState.activeStepIndex > 0) {
        goToStep(appState.activeStepIndex - 1, { animateTwoStage: false, playSound: true });
      }
    },
    onNext: () => {
      stopAutoPlay();
      const maxIdx = getMaxStepCount() - 1;
      if (appState.activeStepIndex < maxIdx) {
        goToStep(appState.activeStepIndex + 1, { animateTwoStage: true, playSound: true });
      }
    },
    onReplay: () => {
      stopAutoPlay();
      goToStep(0, { animateTwoStage: false, playSound: true });
      startAutoPlay();
    },
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

  function renderAll() {
    const maxStepCount = getMaxStepCount();
    if (appState.activeStepIndex >= maxStepCount) {
      appState.activeStepIndex = maxStepCount - 1;
    }

    mapView.update({
      projectionId: appState.settings.projectionId,
      centerId: appState.settings.centerId,
      territoryScope: appState.settings.territoryScope,
      showSoutheastPact: appState.settings.showSoutheastPact,
      showCapitals: appState.settings.showCapitals,
      activeStepIndex: appState.activeStepIndex,
      maxStepCount,
      revealStage: appState.revealStage,
      pulseNonce: appState.pulseNonce,
    });

    controls.update({
      activeStepIndex: appState.activeStepIndex,
      maxStepCount,
      isPlaying: appState.isPlaying,
      projectionId: appState.settings.projectionId,
      territoryScope: appState.settings.territoryScope,
      showSoutheastPact: appState.settings.showSoutheastPact,
      powerMode: appState.settings.powerMode,
    });

    syncTopBar();
  }

  function goToStep(targetIdx, { animateTwoStage = true, playSound = true } = {}) {
    if (twoStageTimer) {
      clearTimeout(twoStageTimer);
      twoStageTimer = null;
    }
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
    if (appState.activeStepIndex >= maxIdx) {
      goToStep(0, { animateTwoStage: false, playSound: false });
      appState.isPlaying = true;
      renderAll();
      playTimer = setTimeout(() => {
        if (!appState.isPlaying) return;
        goToStep(1, { animateTwoStage: true, playSound: true });
        scheduleNextTick();
      }, 1100);
      return;
    }

    appState.isPlaying = true;
    if (appState.activeStepIndex === 0) {
      renderAll();
      playTimer = setTimeout(() => {
        if (!appState.isPlaying) return;
        goToStep(1, { animateTwoStage: true, playSound: true });
        scheduleNextTick();
      }, 1000);
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

    legendSoutheastEl.hidden = !s.showSoutheastPact;
    legendPersonalEl.hidden = s.powerMode !== 'historical11';
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

  // 縮放按鈕
  document.getElementById('btn-zoom-in').addEventListener('click', () => mapView.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click', () => mapView.zoomOut());
  document.getElementById('btn-zoom-reset').addEventListener('click', () => mapView.resetZoom());

  // 鍵盤快速操作
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') {
      stopAutoPlay();
      const maxIdx = getMaxStepCount() - 1;
      if (appState.activeStepIndex < maxIdx) {
        goToStep(appState.activeStepIndex + 1, { animateTwoStage: true, playSound: true });
      }
    } else if (e.key === 'ArrowLeft') {
      stopAutoPlay();
      if (appState.activeStepIndex > 0) {
        goToStep(appState.activeStepIndex - 1, { animateTwoStage: false, playSound: true });
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      if (appState.isPlaying) stopAutoPlay();
      else startAutoPlay();
    }
  });

  // 首次渲染
  renderAll();
}

bootstrap().catch((err) => {
  console.error(err);
  const el = document.getElementById('map-container');
  if (el) {
    el.innerHTML = `<div style="padding:24px;color:#fca5a5;">地圖載入失敗：${err.message}</div>`;
  }
});
