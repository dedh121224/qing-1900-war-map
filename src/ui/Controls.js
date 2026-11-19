export class Controls {
  constructor({
    meterEl,
    narrativeEl,
    timelineEl,
    steps,
    meta,
    onStepChange,
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
    this.onStepChange = onStepChange;
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
          <span class="meter-dot qing"></span>
          <span class="meter-label">大清版圖</span>
          <strong class="meter-val" data-role="qing-val"></strong>
          <span class="meter-pct" data-role="qing-pct"></span>
        </div>
        <div class="meter-ratio" data-role="ratio-badge">敵我面積比 1 : 0.0</div>
        <div class="meter-stat meter-powers">
          <span class="meter-dot powers"></span>
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
          ⚠ 麥卡托投影會嚴重誇大高緯度視覺面積；上方數據仍為真實球面面積
        </span>
        <span class="notice-pill is-info" data-role="southeast-pill" hidden>
          斜紋標示「東南互保」諸省：拒奉宣戰詔書，清廷實際主戰控制區更小
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
          <span data-role="play-text">播放宣戰</span>
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
      qingVal: this.meterEl.querySelector('[data-role="qing-val"]'),
      qingPct: this.meterEl.querySelector('[data-role="qing-pct"]'),
      powersLabel: this.meterEl.querySelector('[data-role="powers-label"]'),
      powersVal: this.meterEl.querySelector('[data-role="powers-val"]'),
      powersPct: this.meterEl.querySelector('[data-role="powers-pct"]'),
      ratioBadge: this.meterEl.querySelector('[data-role="ratio-badge"]'),
      barQing: this.meterEl.querySelector('[data-role="bar-qing"]'),
      barPowers: this.meterEl.querySelector('[data-role="bar-powers"]'),
      mercatorPill: this.meterEl.querySelector('[data-role="mercator-pill"]'),
      southeastPill: this.meterEl.querySelector('[data-role="southeast-pill"]'),

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

  _animatePowersCounter(targetKm2) {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    const startKm2 = this.displayedPowersKm2;
    if (Math.abs(targetKm2 - startKm2) < 500) {
      this.displayedPowersKm2 = targetKm2;
      this._paintPowersStat(targetKm2);
      return;
    }

    const duration = 420;
    const t0 = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = startKm2 + (targetKm2 - startKm2) * eased;
      this.displayedPowersKm2 = val;
      this._paintPowersStat(val);
      if (progress < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this.displayedPowersKm2 = targetKm2;
      }
    };
    this.animFrame = requestAnimationFrame(step);
  }

  _paintPowersStat(km2) {
    const { globalLandKm2, powers } = this.meta;
    const qingKm2 = powers.qing?.totalKm2 || 1;
    const wan = Math.round(km2 / 10_000);
    const pct = ((km2 / globalLandKm2) * 100).toFixed(1);
    const ratio = (km2 / qingKm2).toFixed(1);
    this.els.powersVal.textContent = `${wan.toLocaleString()} 萬 km²`;
    this.els.powersPct.textContent = `${pct}%`;
    this.els.ratioBadge.textContent = `敵我面積比 1 : ${ratio}`;
  }

  update({
    activeStepIndex,
    maxStepCount,
    isPlaying,
    projectionId,
    territoryScope,
    showSoutheastPact,
    powerMode,
  }) {
    const visibleSteps = this.steps.slice(0, maxStepCount);
    const currentStep = visibleSteps[activeStepIndex] || visibleSteps[0];
    const { globalLandKm2, powers } = this.meta;

    // 計算大清與已宣戰列強總面積
    const qingKm2 = powers.qing?.totalKm2 || 0;
    const qingPct = ((qingKm2 / globalLandKm2) * 100).toFixed(1);
    this.els.qingVal.textContent = `${Math.round(qingKm2 / 10_000).toLocaleString()} 萬 km²`;
    this.els.qingPct.textContent = `${qingPct}%`;

    let declaredKm2 = 0;
    for (let i = 1; i <= activeStepIndex && i < visibleSteps.length; i++) {
      const p = powers[visibleSteps[i].id];
      if (!p) continue;
      if (territoryScope === 'metropoleOnly') {
        declaredKm2 += p.metropoleKm2;
      } else {
        declaredKm2 += p.totalKm2;
      }
    }

    const declaredCount = activeStepIndex;
    const scopeText = territoryScope === 'metropoleOnly' ? '本土' : '全球含屬地';
    this.els.powersLabel.textContent =
      declaredCount > 0 ? `已宣戰 ${declaredCount} 國 (${scopeText})` : `已宣戰列強 (${scopeText})`;

    this._animatePowersCounter(declaredKm2);

    this.els.barQing.style.width = `${((qingKm2 / globalLandKm2) * 100).toFixed(2)}%`;
    this.els.barPowers.style.width = `${((declaredKm2 / globalLandKm2) * 100).toFixed(2)}%`;

    this.els.mercatorPill.hidden = projectionId !== 'mercator';
    this.els.southeastPill.hidden = !showSoutheastPact;

    // 台詞與歷史卡片
    this.els.stepLead.textContent = currentStep.speechLead;
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

    // 播放按鈕狀態
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

    // 渲染步驟時間軸膠囊
    this._renderTimeline(visibleSteps, activeStepIndex, powerMode);
  }

  _renderTimeline(visibleSteps, activeStepIndex) {
    if (this._lastTimelineCount !== visibleSteps.length) {
      this.timelineEl.innerHTML = '';
      visibleSteps.forEach((step, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'timeline-pill';
        if (step.isHistoricalExtra) {
          btn.classList.add('is-extra');
        }
        btn.dataset.index = String(idx);
        btn.textContent = step.shortLabel;
        btn.title = step.nameZh;
        btn.addEventListener('click', () => this.onStepChange(idx));
        this.timelineEl.appendChild(btn);
      });
      this._lastTimelineCount = visibleSteps.length;
    }

    const pills = this.timelineEl.querySelectorAll('.timeline-pill');
    pills.forEach((btn, idx) => {
      btn.classList.toggle('is-active', idx === activeStepIndex);
      btn.classList.toggle('is-passed', idx > 0 && idx < activeStepIndex);
      btn.classList.toggle('is-qing', idx === 0);
      if (idx === activeStepIndex) {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
  }
}
