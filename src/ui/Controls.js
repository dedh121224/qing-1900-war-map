import { POWER_META } from '../data/narrative.js';

export class Controls {
  constructor({
    meterEl,
    narrativeEl,
    timelineEl,
    steps,
    meta,
    onSelectSoloCountry,
    onTogglePlay,
    onPrev,
    onNext,
    onReplay,
  }) {
    this.meterEl = meterEl;
    this.narrativeEl = narrativeEl;
    this.timelineEl = timelineEl;
    this.steps = steps;
    this.meta = meta;
    this.onSelectSoloCountry = onSelectSoloCountry;
    this.onTogglePlay = onTogglePlay;
    this.onPrev = onPrev;
    this.onNext = onNext;
    this.onReplay = onReplay;

    this.displayedPowersKm2 = 0;
    this.animFrame = null;
    this.summaryExpandedMobile = false;

    this._buildDom();
  }

  _buildDom() {
    this.meterEl.innerHTML = `
      <div class="meter-top-row">
        <div class="meter-stat meter-qing">
          <span class="meter-dot qing" data-role="left-dot"></span>
          <span class="meter-label" data-role="left-label">大清版圖</span>
          <strong class="meter-val" data-role="qing-val"></strong>
          <span class="meter-pct" data-role="qing-pct"></span>
        </div>
        <div class="meter-ratio" data-role="ratio-badge">敵我面積比 1 : 0.0</div>
        <div class="meter-stat meter-powers">
          <span class="meter-dot powers" data-role="right-dot"></span>
          <span class="meter-label" data-role="powers-label">已宣戰列強</span>
          <strong class="meter-val" data-role="powers-val">0 萬 km²</strong>
          <span class="meter-pct" data-role="powers-pct">0.0%</span>
        </div>
      </div>
      <div class="meter-bar-track" aria-hidden="true">
        <div class="meter-bar-qing" data-role="bar-qing"></div>
        <div class="meter-bar-powers" data-role="bar-powers"></div>
      </div>
      <div class="meter-notices">
        <span class="notice-pill is-warn" data-role="mercator-pill" hidden>
          ⚠ 麥卡托投影會嚴重誇大高緯度面積；上方數據仍為真實球面面積
        </span>
        <span class="notice-pill is-info" data-role="southeast-pill" hidden>
          斜紋標示「東南互保」諸省：拒奉宣戰詔書，實際主戰控制區更小
        </span>
        <span class="notice-pill is-info" data-role="congo-pill" hidden>
          剛果自由邦以斜紋標示：1900 年屬比王利奧波德二世私領
        </span>
      </div>
    `;

    this.narrativeEl.innerHTML = `
      <div class="narrative-main">
        <div class="narrative-meta-row">
          <span class="step-badge" data-role="step-lead"></span>
          <span class="step-area-pill" data-role="step-area"></span>
        </div>
        <blockquote class="narrative-quote" data-role="quote"></blockquote>
        <div class="narrative-details" data-role="details-wrap">
          <p class="narrative-summary" data-role="summary"></p>
          <p class="narrative-colonies" data-role="colonies"></p>
        </div>
        <button type="button" class="mobile-detail-toggle" data-role="toggle-detail" aria-expanded="false">
          展開 1900 歷史註解 ▾
        </button>
      </div>
      <div class="transport-controls">
        <button type="button" class="btn-icon" data-action="prev" aria-label="上一步" title="上一步">
          ◀
        </button>
        <button type="button" class="btn-play" data-action="play">
          <span data-role="play-icon">▶</span>
          <span data-role="play-text">開始宣戰</span>
        </button>
        <button type="button" class="btn-icon" data-action="next" aria-label="下一步" title="下一步">
          ▶
        </button>
        <button type="button" class="btn-icon" data-action="replay" aria-label="從大清重播" title="重播">
          ↺
        </button>
      </div>
    `;

    this.els = {
      leftDot: this.meterEl.querySelector('[data-role="left-dot"]'),
      leftLabel: this.meterEl.querySelector('[data-role="left-label"]'),
      qingVal: this.meterEl.querySelector('[data-role="qing-val"]'),
      qingPct: this.meterEl.querySelector('[data-role="qing-pct"]'),
      rightDot: this.meterEl.querySelector('[data-role="right-dot"]'),
      powersLabel: this.meterEl.querySelector('[data-role="powers-label"]'),
      powersVal: this.meterEl.querySelector('[data-role="powers-val"]'),
      powersPct: this.meterEl.querySelector('[data-role="powers-pct"]'),
      ratioBadge: this.meterEl.querySelector('[data-role="ratio-badge"]'),
      barQing: this.meterEl.querySelector('[data-role="bar-qing"]'),
      barPowers: this.meterEl.querySelector('[data-role="bar-powers"]'),
      mercatorPill: this.meterEl.querySelector('[data-role="mercator-pill"]'),
      southeastPill: this.meterEl.querySelector('[data-role="southeast-pill"]'),
      congoPill: this.meterEl.querySelector('[data-role="congo-pill"]'),

      stepLead: this.narrativeEl.querySelector('[data-role="step-lead"]'),
      stepArea: this.narrativeEl.querySelector('[data-role="step-area"]'),
      quote: this.narrativeEl.querySelector('[data-role="quote"]'),
      detailsWrap: this.narrativeEl.querySelector('[data-role="details-wrap"]'),
      summary: this.narrativeEl.querySelector('[data-role="summary"]'),
      colonies: this.narrativeEl.querySelector('[data-role="colonies"]'),
      toggleDetail: this.narrativeEl.querySelector('[data-role="toggle-detail"]'),

      btnPrev: this.narrativeEl.querySelector('[data-action="prev"]'),
      btnPlay: this.narrativeEl.querySelector('[data-action="play"]'),
      btnNext: this.narrativeEl.querySelector('[data-action="next"]'),
      btnReplay: this.narrativeEl.querySelector('[data-action="replay"]'),
      playIcon: this.narrativeEl.querySelector('[data-role="play-icon"]'),
      playText: this.narrativeEl.querySelector('[data-role="play-text"]'),
    };

    this.els.btnPrev.addEventListener('click', () => this.onPrev());
    this.els.btnPlay.addEventListener('click', () => this.onTogglePlay());
    this.els.btnNext.addEventListener('click', () => this.onNext());
    this.els.btnReplay.addEventListener('click', () => this.onReplay());

    this.els.toggleDetail.addEventListener('click', () => {
      this.summaryExpandedMobile = !this.summaryExpandedMobile;
      this.els.detailsWrap.classList.toggle('is-expanded', this.summaryExpandedMobile);
      this.els.toggleDetail.setAttribute('aria-expanded', String(this.summaryExpandedMobile));
      this.els.toggleDetail.textContent = this.summaryExpandedMobile
        ? '收合歷史註解 ▴'
        : '展開 1900 歷史註解 ▾';
    });
  }

  _animatePowersCounter(targetKm2, mode, soloPower) {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    const startKm2 = this.displayedPowersKm2;
    if (Math.abs(targetKm2 - startKm2) < 500) {
      this.displayedPowersKm2 = targetKm2;
      this._paintRightStat(targetKm2, mode, soloPower);
      return;
    }

    const duration = 380;
    const t0 = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = startKm2 + (targetKm2 - startKm2) * eased;
      this.displayedPowersKm2 = val;
      this._paintRightStat(val, mode, soloPower);
      if (progress < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this.displayedPowersKm2 = targetKm2;
      }
    };
    this.animFrame = requestAnimationFrame(step);
  }

  _paintRightStat(km2, mode, soloPower) {
    const { globalLandKm2, powers } = this.meta;
    const qingKm2 = powers.qing?.totalKm2 || 1;
    const wan = Math.round(km2 / 10_000);
    const pct = ((km2 / globalLandKm2) * 100).toFixed(1);
    const ratio = (km2 / qingKm2).toFixed(1);

    this.els.powersVal.textContent = `${wan.toLocaleString()} 萬 km²`;
    this.els.powersPct.textContent = `${pct}%`;

    if (mode === 'solo' && soloPower) {
      this.els.ratioBadge.textContent =
        soloPower.id === 'qing'
          ? '單國版圖檢視・大清帝國'
          : `單國版圖 vs 大清 1 : ${ratio}`;
    } else {
      this.els.ratioBadge.textContent = `敵我面積比 1 : ${ratio}`;
    }
  }

  _renderPowerSegments(items, totalKm2, colorMode) {
    if (colorMode !== 'byPower') {
      this.els.barPowers.classList.add('is-unified');
      this.els.barPowers.innerHTML = '';
      return;
    }
    this.els.barPowers.classList.remove('is-unified');
    if (totalKm2 <= 0 || items.length === 0) {
      this.els.barPowers.innerHTML = '';
      return;
    }
    this.els.barPowers.innerHTML = items
      .map((item) => {
        const w = ((item.km2 / totalKm2) * 100).toFixed(2);
        return `<div class="meter-seg power-${item.id}" style="width:${w}%"></div>`;
      })
      .join('');
  }

  update({
    viewMode,
    soloPowerId,
    activeStepIndex,
    maxStepCount,
    isPlaying,
    projectionId,
    territoryScope,
    showSoutheastPact,
    powerMode,
    colorMode,
  }) {
    const isSolo = viewMode === 'solo' && Boolean(soloPowerId);
    const visibleSteps = this.steps.slice(0, maxStepCount);
    const currentStep = isSolo
      ? POWER_META[soloPowerId] || visibleSteps[0]
      : visibleSteps[activeStepIndex] || visibleSteps[0];

    const { globalLandKm2, powers } = this.meta;
    const qingKm2 = powers.qing?.totalKm2 || 0;
    const qingPct = ((qingKm2 / globalLandKm2) * 100).toFixed(1);
    const scopeText = territoryScope === 'metropoleOnly' ? '本土' : '全球含屬地';

    if (isSolo) {
      const soloStats = powers[currentStep.id];
      const soloKm2 =
        currentStep.id === 'qing'
          ? qingKm2
          : territoryScope === 'metropoleOnly'
            ? soloStats?.metropoleKm2 || 0
            : soloStats?.totalKm2 || 0;

      this.els.leftDot.className = 'meter-dot qing';
      this.els.leftLabel.textContent = currentStep.id === 'qing' ? '大清版圖' : '大清對照（未亮）';
      this.els.qingVal.textContent = `${Math.round(qingKm2 / 10_000).toLocaleString()} 萬 km²`;
      this.els.qingPct.textContent = `${qingPct}%`;

      this.els.rightDot.className = `country-dot power-${currentStep.id}`;
      this.els.powersLabel.textContent =
        currentStep.id === 'qing' ? '未開啟宣戰' : `${currentStep.shortLabel} (${scopeText})`;

      const displayedRightKm2 = currentStep.id === 'qing' ? 0 : soloKm2;
      this._animatePowersCounter(displayedRightKm2, 'solo', currentStep);

      this.els.barQing.style.width =
        currentStep.id === 'qing' ? `${((qingKm2 / globalLandKm2) * 100).toFixed(2)}%` : '0%';
      this.els.barPowers.style.width = `${((displayedRightKm2 / globalLandKm2) * 100).toFixed(2)}%`;
      this._renderPowerSegments(
        displayedRightKm2 > 0 ? [{ id: currentStep.id, km2: displayedRightKm2 }] : [],
        displayedRightKm2,
        colorMode
      );

      this.els.stepLead.textContent = `單國領土檢視・${currentStep.nameZh}（點「開始宣戰」由大清開演）`;
      this.els.btnPrev.disabled = true;
      this.els.btnNext.disabled = false;
      this.els.playIcon.textContent = '▶';
      this.els.playText.textContent = '開始宣戰';
      this.els.btnPlay.classList.remove('is-playing');
    } else {
      this.els.leftDot.className = 'meter-dot qing';
      this.els.leftLabel.textContent = '大清版圖';
      this.els.qingVal.textContent = `${Math.round(qingKm2 / 10_000).toLocaleString()} 萬 km²`;
      this.els.qingPct.textContent = `${qingPct}%`;

      let declaredKm2 = 0;
      const declaredItems = [];
      for (let i = 1; i <= activeStepIndex && i < visibleSteps.length; i++) {
        const sid = visibleSteps[i].id;
        const p = powers[sid];
        if (!p) continue;
        const km2 = territoryScope === 'metropoleOnly' ? p.metropoleKm2 : p.totalKm2;
        declaredKm2 += km2;
        declaredItems.push({ id: sid, km2 });
      }

      const declaredCount = activeStepIndex;
      this.els.rightDot.className =
        colorMode === 'byPower' && activeStepIndex > 0
          ? `country-dot power-${currentStep.id}`
          : 'meter-dot powers';
      this.els.powersLabel.textContent =
        declaredCount > 0 ? `已宣戰 ${declaredCount} 國 (${scopeText})` : `已宣戰列強 (${scopeText})`;

      this._animatePowersCounter(declaredKm2, 'sequence', null);

      this.els.barQing.style.width = `${((qingKm2 / globalLandKm2) * 100).toFixed(2)}%`;
      this.els.barPowers.style.width = `${((declaredKm2 / globalLandKm2) * 100).toFixed(2)}%`;
      this._renderPowerSegments(declaredItems, declaredKm2, colorMode);

      const totalEnemies = visibleSteps.length - 1;
      this.els.stepLead.textContent =
        activeStepIndex === 0
          ? `宣戰前夕・${currentStep.speechLead}`
          : `宣戰順序 ${activeStepIndex} / ${totalEnemies}・${currentStep.speechLead}`;

      const atEnd = activeStepIndex >= visibleSteps.length - 1;
      this.els.btnPrev.disabled = activeStepIndex <= 0;
      this.els.btnNext.disabled = atEnd;

      if (isPlaying) {
        this.els.playIcon.textContent = '⏸';
        this.els.playText.textContent = '暫停';
        this.els.btnPlay.classList.add('is-playing');
      } else if (atEnd) {
        this.els.playIcon.textContent = '↺';
        this.els.playText.textContent = '再播一次';
        this.els.btnPlay.classList.remove('is-playing');
      } else {
        this.els.playIcon.textContent = '▶';
        this.els.playText.textContent = activeStepIndex === 0 ? '開始宣戰' : '繼續播放';
        this.els.btnPlay.classList.remove('is-playing');
      }
    }

    // 狀態提醒膠囊
    const qingVisible = !isSolo || soloPowerId === 'qing';
    this.els.mercatorPill.hidden = projectionId !== 'mercator';
    this.els.southeastPill.hidden = !(showSoutheastPact && qingVisible);
    this.els.congoPill.hidden = !(
      powerMode === 'historical11' &&
      territoryScope === 'all' &&
      (!isSolo || soloPowerId === 'belgium')
    );

    // 單國面積膠囊與台詞卡
    const curStats = powers[currentStep.id];
    if (curStats) {
      const shownKm2 =
        currentStep.id === 'qing'
          ? curStats.totalKm2
          : territoryScope === 'metropoleOnly'
            ? curStats.metropoleKm2
            : curStats.totalKm2;
      const curPct = ((shownKm2 / globalLandKm2) * 100).toFixed(2);
      const curWan = (shownKm2 / 10_000).toFixed(1);
      this.els.stepArea.textContent = `${currentStep.nameZh}：${curWan} 萬 km²（${curPct}%）`;
    }

    this.els.quote.textContent = currentStep.quote;
    this.els.summary.textContent = currentStep.summary;
    this.els.colonies.textContent =
      territoryScope === 'metropoleOnly' && currentStep.id !== 'qing'
        ? `目前切換為「僅顯示本土」；若含海外殖民地與自治領則包含：${currentStep.coloniesSummary}`
        : `1900 版圖：${currentStep.coloniesSummary}`;

    this._renderCountryButtons(visibleSteps, { viewMode, soloPowerId, activeStepIndex });
  }

  _renderCountryButtons(visibleSteps, { viewMode, soloPowerId, activeStepIndex }) {
    if (this._lastCount !== visibleSteps.length) {
      this.timelineEl.innerHTML = '';
      visibleSteps.forEach((step) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'timeline-pill';
        if (step.isHistoricalExtra) {
          btn.classList.add('is-extra');
        }
        btn.dataset.powerId = step.id;
        btn.title = `單獨檢視 ${step.nameZh} 1900 年版圖`;
        btn.innerHTML = `<span class="country-dot power-${step.id}"></span><span>${step.shortLabel}</span>`;
        btn.addEventListener('click', () => this.onSelectSoloCountry(step.id));
        this.timelineEl.appendChild(btn);
      });
      this._lastCount = visibleSteps.length;
    }

    const pills = this.timelineEl.querySelectorAll('.timeline-pill');
    const isSolo = viewMode === 'solo';
    pills.forEach((btn, idx) => {
      const pid = btn.dataset.powerId;
      const isSelectedSolo = isSolo && pid === soloPowerId;
      const isInSequence = !isSolo && idx <= activeStepIndex;
      btn.classList.toggle('is-solo-selected', isSelectedSolo);
      btn.classList.toggle('is-in-sequence', isInSequence);
      if (isSelectedSolo || (!isSolo && idx === activeStepIndex)) {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
  }
}
