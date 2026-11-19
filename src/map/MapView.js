import { geoGraticule10, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import { SOUTHEAST_PACT_FEATURE } from '../data/southeast-pact.js';
import { POWER_META } from '../data/narrative.js';
import { createProjection } from './projections.js';

const TIER_LABELS = {
  qing: '大清帝國疆域',
  metropole: '本土疆域',
  colony: '殖民地／海外領地／保護國',
  personal: '王室私人領地（1908 併入比國）',
  neutral: '非宣戰政區／中立國',
};

function formatKm2(areaKm2) {
  if (areaKm2 >= 10_000) {
    return `${(areaKm2 / 10_000).toFixed(1)} 萬 km²`;
  }
  return `${Math.round(areaKm2).toLocaleString()} km²`;
}

export class MapView {
  constructor({
    containerEl,
    tooltipEl,
    mobileInspectEl,
    features,
    meta,
    steps,
    onSelectFeature,
  }) {
    this.containerEl = containerEl;
    this.tooltipEl = tooltipEl;
    this.mobileInspectEl = mobileInspectEl;
    this.features = features;
    this.meta = meta;
    this.steps = steps;
    this.onSelectFeature = onSelectFeature;

    this.qingFeature = features.find((f) => f.properties.power === 'qing') || null;
    this.graticule = geoGraticule10();
    this.sphere = { type: 'Sphere' };

    this.state = {
      projectionId: 'equalEarth',
      centerId: 'eastAsia',
      territoryScope: 'all',
      showSoutheastPact: false,
      showCapitals: true,
      viewMode: 'sequence', // 'sequence' | 'solo'
      soloPowerId: null,
      activeStepIndex: 0,
      maxStepCount: 9,
      revealStage: 'all', // 'metropole' | 'all'
      pulseNonce: 0,
    };

    this.width = 960;
    this.height = 520;
    this.currentTransform = zoomIdentity;
    this.selectedFeature = null;

    this._initDom();
    this._initZoom();
    this._initResizeObserver();
  }

  _initDom() {
    this.svg = select(this.containerEl)
      .append('svg')
      .attr('class', 'world-map-svg')
      .attr('role', 'img')
      .attr('aria-label', '1900 年庚子宣戰全球歷史版圖等積投影地圖');

    const defs = this.svg.append('defs');

    const glow = defs
      .append('filter')
      .attr('id', 'qing-glow')
      .attr('x', '-15%')
      .attr('y', '-15%')
      .attr('width', '130%')
      .attr('height', '130%');
    glow.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 0)
      .attr('stdDeviation', 4)
      .attr('flood-color', '#d97706')
      .attr('flood-opacity', 0.42);

    const sePat = defs
      .append('pattern')
      .attr('id', 'southeast-pattern')
      .attr('width', 8)
      .attr('height', 8)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)');
    sePat.append('rect').attr('width', 8).attr('height', 8).attr('class', 'se-pattern-bg');
    sePat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 8).attr('class', 'se-pattern-line');

    const personalPat = defs
      .append('pattern')
      .attr('id', 'personal-pattern')
      .attr('width', 7)
      .attr('height', 7)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(-45)');
    personalPat.append('rect').attr('width', 7).attr('height', 7).attr('class', 'personal-pattern-bg');
    personalPat.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 7).attr('class', 'personal-pattern-line');

    this.sphereClipRect = defs.append('clipPath').attr('id', 'map-frame-clip').append('path');
    this.qingClipPath = defs.append('clipPath').attr('id', 'qing-clip').append('path');

    this.zoomGroup = this.svg.append('g').attr('class', 'zoom-layer');
    this.oceanLayer = this.zoomGroup.append('g').attr('class', 'layer-ocean');
    this.clippedContent = this.zoomGroup
      .append('g')
      .attr('class', 'layer-clipped')
      .attr('clip-path', 'url(#map-frame-clip)');
    this.frameLayer = this.zoomGroup.append('g').attr('class', 'layer-frame');

    this.graticulePath = this.clippedContent.append('path').attr('class', 'map-graticule');
    this.regionsLayer = this.clippedContent.append('g').attr('class', 'layer-regions');
    this.southeastLayer = this.clippedContent
      .append('g')
      .attr('class', 'layer-southeast')
      .attr('clip-path', 'url(#qing-clip)');
    this.capitalsLayer = this.clippedContent.append('g').attr('class', 'layer-capitals');

    this.oceanFill = this.oceanLayer.append('path').attr('class', 'map-ocean-fill');
    this.oceanFrameOuter = this.frameLayer.append('path').attr('class', 'map-ocean-frame-outer');
    this.oceanFrameInner = this.frameLayer.append('path').attr('class', 'map-ocean-frame-inner');

    this.oceanFill.on('click', () => {
      this._clearPinnedFeature();
    });

    this.regionPaths = this.regionsLayer
      .selectAll('path.region-path')
      .data(this.features, (d) => d.properties.id)
      .join('path')
      .attr('class', (d) => `region-path power-${d.properties.power}`)
      .on('pointerenter', (event, d) => {
        if (event.pointerType === 'touch') return;
        this._showTooltip(event, d);
      })
      .on('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        this._positionTooltip(event);
      })
      .on('pointerleave', (event) => {
        if (event.pointerType === 'touch') return;
        this._hideTooltip();
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        this._pinFeature(d);
      });

    this.southeastPath = this.southeastLayer
      .append('path')
      .datum(SOUTHEAST_PACT_FEATURE)
      .attr('class', 'southeast-pact-overlay')
      .on('pointerenter', (event, d) => {
        if (event.pointerType === 'touch') return;
        this._showSoutheastTooltip(event, d);
      })
      .on('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        this._positionTooltip(event);
      })
      .on('pointerleave', () => {
        this._hideTooltip();
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        this._pinSoutheast(d);
      });
  }

  _initZoom() {
    this.zoomBehavior = zoom()
      .scaleExtent([1, 9])
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        this.zoomGroup.attr('transform', event.transform.toString());
        this.zoomGroup.style('--zoom-k', event.transform.k);
      });

    this.svg.call(this.zoomBehavior).on('dblclick.zoom', null);
  }

  _initResizeObserver() {
    this.refreshLayout();
    this.resizeObserver = new ResizeObserver(() => this.refreshLayout());
    this.resizeObserver.observe(this.containerEl);
  }

  refreshLayout({ resetZoom = false } = {}) {
    const w = this.containerEl.clientWidth;
    const h = this.containerEl.clientHeight;
    if (w < 40 || h < 40) return;
    this.width = Math.round(w);
    this.height = Math.round(h);
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`);
    this.zoomBehavior.translateExtent([
      [-this.width * 0.15, -this.height * 0.15],
      [this.width * 1.15, this.height * 1.15],
    ]);
    if (resetZoom) {
      this.currentTransform = zoomIdentity;
      this.svg.call(this.zoomBehavior.transform, zoomIdentity);
    }
    this._renderGeometry();
    this._renderCapitals();
  }

  zoomIn() {
    this.svg.transition().duration(260).call(this.zoomBehavior.scaleBy, 1.5);
  }

  zoomOut() {
    this.svg.transition().duration(260).call(this.zoomBehavior.scaleBy, 1 / 1.5);
  }

  resetZoom() {
    this.svg.transition().duration(340).call(this.zoomBehavior.transform, zoomIdentity);
  }

  update(nextState) {
    const needReproject =
      nextState.projectionId !== this.state.projectionId ||
      nextState.centerId !== this.state.centerId;

    this.state = { ...this.state, ...nextState };

    if (needReproject) {
      this._renderGeometry();
    }
    this._renderStates();
    this._renderCapitals();

    if (this.selectedFeature) {
      this._renderPinnedCard(this.selectedFeature);
    }
  }

  _renderGeometry() {
    const pad = this.width < 640 ? 8 : 16;
    const projResult = createProjection({
      projectionId: this.state.projectionId,
      centerId: this.state.centerId,
      width: this.width,
      height: this.height,
      padding: pad,
    });

    this.projection = projResult.projection;
    this.isMercator = projResult.isMercator;
    this.clipBox = projResult.clipBox;
    this.pathGen = geoPath(this.projection);

    if (this.isMercator && this.clipBox) {
      const { x, y, width, height } = this.clipBox;
      const rectPath = `M${x},${y}h${width}v${height}h${-width}Z`;
      const outerPath = `M${x - 4},${y - 4}h${width + 8}v${height + 8}h${-(width + 8)}Z`;
      this.sphereClipRect.attr('d', rectPath);
      this.oceanFill.attr('d', rectPath);
      this.oceanFrameInner.attr('d', rectPath);
      this.oceanFrameOuter.attr('d', outerPath);
    } else {
      const sphereD = this.pathGen(this.sphere);
      this.sphereClipRect.attr('d', sphereD);
      this.oceanFill.attr('d', sphereD);
      this.oceanFrameInner.attr('d', sphereD);
      this.oceanFrameOuter.attr('d', sphereD);
    }

    this.graticulePath.attr('d', this.pathGen(this.graticule));
    this.regionPaths.attr('d', (d) => this.pathGen(d));

    if (this.qingFeature) {
      this.qingClipPath.attr('d', this.pathGen(this.qingFeature));
    }
    this.southeastPath.attr('d', (d) => this.pathGen(d));
  }

  _renderStates() {
    const {
      viewMode,
      soloPowerId,
      activeStepIndex,
      maxStepCount,
      territoryScope,
      showSoutheastPact,
      revealStage,
    } = this.state;

    const isSolo = viewMode === 'solo' && Boolean(soloPowerId);
    const visibleSteps = this.steps.slice(0, maxStepCount);
    const activeStep = visibleSteps[activeStepIndex] || visibleSteps[0];
    const activePowerId = isSolo ? soloPowerId : activeStep?.id || 'qing';

    const declaredSet = new Set();
    if (!isSolo) {
      for (let i = 1; i <= activeStepIndex && i < visibleSteps.length; i++) {
        declaredSet.add(visibleSteps[i].id);
      }
    }

    const qingLit = isSolo ? soloPowerId === 'qing' : true;

    this.regionPaths.attr('class', (d) => {
      const { power, tier } = d.properties;
      const classes = ['region-path', `power-${power}`];

      if (power === 'qing') {
        if (qingLit) {
          classes.push('is-qing');
          if (isSolo || activeStepIndex === 0) {
            classes.push('is-qing-focus');
          }
        } else {
          classes.push('is-unlit');
        }
        return classes.join(' ');
      }

      const isLitPower = isSolo ? power === soloPowerId : declaredSet.has(power);
      if (power === 'neutral' || !isLitPower) {
        classes.push(power === 'neutral' ? 'is-neutral' : 'is-unlit');
        return classes.join(' ');
      }

      const isMetropole = tier === 'metropole';
      if (territoryScope === 'metropoleOnly' && !isMetropole) {
        classes.push('is-unlit-scope');
        return classes.join(' ');
      }

      const isCurrentPower = power === activePowerId;
      if (isCurrentPower) {
        if (isMetropole) {
          classes.push('is-active-metropole');
        } else if (!isSolo && revealStage === 'metropole') {
          classes.push('is-unlit-pending');
        } else if (tier === 'personal') {
          classes.push('is-active-personal');
        } else {
          classes.push('is-active-colony');
        }
      } else {
        if (isMetropole) {
          classes.push('is-declared-metropole');
        } else if (tier === 'personal') {
          classes.push('is-declared-personal');
        } else {
          classes.push('is-declared-colony');
        }
      }

      return classes.join(' ');
    });

    this.regionPaths.attr('filter', (d) =>
      d.properties.power === 'qing' && qingLit ? 'url(#qing-glow)' : null
    );

    this.southeastLayer.classed('is-visible', Boolean(showSoutheastPact && qingLit));
  }

  _renderCapitals() {
    if (!this.projection) return;
    const { viewMode, soloPowerId, activeStepIndex, maxStepCount, showCapitals, pulseNonce } = this.state;

    if (!showCapitals) {
      this.capitalsLayer.selectAll('*').remove();
      return;
    }

    const isSolo = viewMode === 'solo' && Boolean(soloPowerId);
    const visibleSteps = this.steps.slice(0, maxStepCount);
    const activeItemsRaw = isSolo
      ? visibleSteps
          .filter((s) => s.id === soloPowerId)
          .map((step) => ({
            ...step,
            isCurrent: true,
            isQing: step.id === 'qing',
          }))
      : visibleSteps.slice(0, activeStepIndex + 1).map((step, idx) => ({
          ...step,
          isCurrent: idx === activeStepIndex,
          isQing: step.id === 'qing',
        }));

    const activeItems = activeItemsRaw
      .map((item) => ({
        ...item,
        projected: this.projection(item.capital.coords),
      }))
      .filter((item) => Array.isArray(item.projected) && Number.isFinite(item.projected[0]));

    const groups = this.capitalsLayer
      .selectAll('g.capital-marker')
      .data(activeItems, (d) => d.id)
      .join(
        (enter) => {
          const g = enter.append('g').attr('class', 'capital-marker');
          g.append('circle').attr('class', 'capital-pulse');
          g.append('circle').attr('class', 'capital-core');
          g.append('text').attr('class', 'capital-label');
          return g;
        },
        (update) => update,
        (exit) => exit.remove()
      );

    groups
      .attr('transform', (d) => `translate(${d.projected[0]}, ${d.projected[1]})`)
      .classed('is-current', (d) => d.isCurrent)
      .classed('is-qing', (d) => d.isQing);

    groups.select('circle.capital-core').attr('r', (d) => (d.isCurrent ? 4.4 : 2.8));

    groups
      .select('circle.capital-pulse')
      .attr('r', 4)
      .style('display', (d) => (d.isCurrent ? null : 'none'))
      .attr('data-nonce', pulseNonce);

    groups.each(function (d) {
      if (d.isCurrent) {
        const pulse = this.querySelector('circle.capital-pulse');
        if (pulse) {
          pulse.classList.remove('animate-pulse');
          void pulse.getBoundingClientRect();
          pulse.classList.add('animate-pulse');
        }
      }
    });

    groups
      .select('text.capital-label')
      .attr('x', 7)
      .attr('y', 3)
      .text((d) => (d.isCurrent || d.isQing ? d.capital.nameZh : ''));
  }

  _buildInfoHtml(d) {
    const p = d.properties;
    const powerMeta = POWER_META[p.power];
    const powerLabel = powerMeta ? powerMeta.nameZh : '獨立政區／未受宣戰';
    const tierLabel = TIER_LABELS[p.tier] || TIER_LABELS.neutral;
    const pct = ((p.areaKm2 / this.meta.globalLandKm2) * 100).toFixed(2);
    const noteHtml = p.note ? `<div class="inspect-note">${p.note}</div>` : '';

    return `
      <div class="inspect-header">
        <span class="inspect-power-dot power-${p.power}"></span>
        <span class="inspect-power-name">${powerLabel}</span>
        <span class="inspect-tier-badge">${tierLabel}</span>
      </div>
      <div class="inspect-title">${p.zhName}</div>
      <div class="inspect-subtitle">${p.enName}</div>
      <div class="inspect-stats">
        <span>真實面積：<strong>${formatKm2(p.areaKm2)}</strong></span>
        <span>佔全球陸地：<strong>${pct}%</strong></span>
      </div>
      ${noteHtml}
    `;
  }

  _showTooltip(event, d) {
    this.tooltipEl.innerHTML = this._buildInfoHtml(d);
    this.tooltipEl.hidden = false;
    this._positionTooltip(event);
  }

  _showSoutheastTooltip(event, d) {
    this.tooltipEl.innerHTML = `
      <div class="inspect-header">
        <span class="inspect-power-dot power-qing"></span>
        <span class="inspect-power-name">大清帝國・東南各省</span>
        <span class="inspect-tier-badge">拒奉宣戰詔書</span>
      </div>
      <div class="inspect-title">${d.properties.nameZh}</div>
      <div class="inspect-note">${d.properties.description}</div>
    `;
    this.tooltipEl.hidden = false;
    this._positionTooltip(event);
  }

  _positionTooltip(event) {
    const svgEl = this.svg.node();
    let localX = 16;
    let localY = 16;

    if (svgEl && svgEl.createSVGPoint && svgEl.getScreenCTM()) {
      const pt = svgEl.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const mapped = pt.matrixTransform(svgEl.getScreenCTM().inverse());
      localX = mapped.x;
      localY = mapped.y;
    } else {
      const containerRect = this.containerEl.getBoundingClientRect();
      localX = event.clientX - containerRect.left;
      localY = event.clientY - containerRect.top;
    }

    const tipW = this.tooltipEl.offsetWidth || 260;
    const tipH = this.tooltipEl.offsetHeight || 120;
    const offset = 14;
    let left = localX + offset;
    let top = localY + offset;

    if (left + tipW > this.width - 10) {
      left = Math.max(10, localX - tipW - offset);
    }
    if (top + tipH > this.height - 10) {
      top = Math.max(10, localY - tipH - offset);
    }

    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }

  _hideTooltip() {
    this.tooltipEl.hidden = true;
  }

  _pinFeature(d) {
    this.selectedFeature = d;
    this._renderPinnedCard(d);
    if (this.onSelectFeature) {
      this.onSelectFeature(d);
    }
  }

  _pinSoutheast(d) {
    this.selectedFeature = null;
    this.mobileInspectEl.innerHTML = `
      <button type="button" class="inspect-close" aria-label="關閉地區資訊">✕</button>
      <div class="inspect-header">
        <span class="inspect-power-dot power-qing"></span>
        <span class="inspect-power-name">大清帝國・東南各省</span>
        <span class="inspect-tier-badge">東南互保</span>
      </div>
      <div class="inspect-title">${d.properties.nameZh}</div>
      <div class="inspect-note">${d.properties.description}</div>
    `;
    this.mobileInspectEl.hidden = false;
    this.mobileInspectEl
      .querySelector('.inspect-close')
      .addEventListener('click', () => this._clearPinnedFeature());
  }

  _renderPinnedCard(d) {
    this.mobileInspectEl.innerHTML = `
      <button type="button" class="inspect-close" aria-label="關閉地區資訊">✕</button>
      ${this._buildInfoHtml(d)}
    `;
    this.mobileInspectEl.hidden = false;
    this.mobileInspectEl
      .querySelector('.inspect-close')
      .addEventListener('click', () => this._clearPinnedFeature());
  }

  _clearPinnedFeature() {
    this.selectedFeature = null;
    this.mobileInspectEl.hidden = true;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}
