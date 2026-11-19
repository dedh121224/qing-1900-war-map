import { CENTER_OPTIONS, PROJECTION_OPTIONS } from '../map/projections.js';

export const DEFAULT_SETTINGS = {
  theme: 'cinema',
  projectionId: 'equalEarth',
  centerId: 'europe',
  powerMode: 'drama8',
  territoryScope: 'all',
  twoStageAnimation: true,
  showSoutheastPact: true,
  showCapitals: true,
  soundEnabled: true,
  playbackSpeed: 'normal',
};

export const SPEED_MS = {
  slow: 4500,
  normal: 3000,
  fast: 1800,
};

const STORAGE_KEY = 'qing-1900-settings-v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 忽略隱私模式下 localStorage 寫入限制
  }
}

export class SettingsDrawer {
  constructor({ drawerEl, backdropEl, infoModalEl, meta, initialSettings, onChange }) {
    this.drawerEl = drawerEl;
    this.backdropEl = backdropEl;
    this.infoModalEl = infoModalEl;
    this.meta = meta;
    this.settings = { ...initialSettings };
    this.onChange = onChange;
    this.isOpen = false;
    this.isInfoOpen = false;

    this._renderDrawer();
    this._renderInfoModal();
    this._bindGlobalEvents();
  }

  _renderDrawer() {
    const projRadios = PROJECTION_OPTIONS.map(
      (p) => `
      <label class="option-card">
        <input type="radio" name="projectionId" value="${p.id}" ${this.settings.projectionId === p.id ? 'checked' : ''} />
        <span class="option-card-body">
          <strong>${p.label}</strong>
          <small>${p.description}</small>
        </span>
      </label>`
    ).join('');

    const centerRadios = CENTER_OPTIONS.map(
      (c) => `
      <label class="option-card">
        <input type="radio" name="centerId" value="${c.id}" ${this.settings.centerId === c.id ? 'checked' : ''} />
        <span class="option-card-body">
          <strong>${c.label}</strong>
          <small>${c.description}</small>
        </span>
      </label>`
    ).join('');

    this.drawerEl.innerHTML = `
      <div class="drawer-handle" aria-hidden="true"></div>
      <div class="drawer-header">
        <h2>自訂地圖與播放設定</h2>
        <button type="button" class="btn-close-drawer" data-action="close-drawer" aria-label="關閉設定面板">✕</button>
      </div>
      <div class="drawer-scroll">
        <section class="setting-group">
          <h3>視覺風格</h3>
          <div class="segmented-control" role="radiogroup" aria-label="視覺風格">
            <label class="seg-item">
              <input type="radio" name="theme" value="cinema" ${this.settings.theme === 'cinema' ? 'checked' : ''} />
              <span>深色電影特展</span>
            </label>
            <label class="seg-item">
              <input type="radio" name="theme" value="parchment" ${this.settings.theme === 'parchment' ? 'checked' : ''} />
              <span>復古羊皮紙輿圖</span>
            </label>
          </div>
        </section>

        <section class="setting-group">
          <h3>地圖投影法</h3>
          <div class="option-stack">${projRadios}</div>
        </section>

        <section class="setting-group">
          <h3>視角中心</h3>
          <div class="option-stack">${centerRadios}</div>
        </section>

        <section class="setting-group">
          <h3>宣戰名單</h3>
          <div class="segmented-control" role="radiogroup" aria-label="宣戰名單">
            <label class="seg-item">
              <input type="radio" name="powerMode" value="drama8" ${this.settings.powerMode === 'drama8' ? 'checked' : ''} />
              <span>《走向共和》劇版 8 國</span>
            </label>
            <label class="seg-item">
              <input type="radio" name="powerMode" value="historical11" ${this.settings.powerMode === 'historical11' ? 'checked' : ''} />
              <span>史實《辛丑》11 國</span>
            </label>
          </div>
        </section>

        <section class="setting-group">
          <h3>領土範圍</h3>
          <div class="segmented-control" role="radiogroup" aria-label="領土範圍">
            <label class="seg-item">
              <input type="radio" name="territoryScope" value="all" ${this.settings.territoryScope === 'all' ? 'checked' : ''} />
              <span>含殖民地與自治領</span>
            </label>
            <label class="seg-item">
              <input type="radio" name="territoryScope" value="metropoleOnly" ${this.settings.territoryScope === 'metropoleOnly' ? 'checked' : ''} />
              <span>僅顯示本土</span>
            </label>
          </div>
        </section>

        <section class="setting-group">
          <h3>動畫與圖層開關</h3>
          <label class="switch-row">
            <span>
              <strong>本土 → 殖民地兩段式展開</strong>
              <small>先點亮歐洲／本土核心，0.4 秒後向外引爆全球殖民地</small>
            </span>
            <input type="checkbox" name="twoStageAnimation" ${this.settings.twoStageAnimation ? 'checked' : ''} />
          </label>
          <label class="switch-row">
            <span>
              <strong>顯示「東南互保」區域</strong>
              <small>以斜紋標示拒奉宣戰詔書的東南諸省，反襯實際主戰區</small>
            </span>
            <input type="checkbox" name="showSoutheastPact" ${this.settings.showSoutheastPact ? 'checked' : ''} />
          </label>
          <label class="switch-row">
            <span>
              <strong>顯示首都光點脈衝</strong>
              <small>標示北京與 1900 年各列強首都（如俄國聖彼得堡）</small>
            </span>
            <input type="checkbox" name="showCapitals" ${this.settings.showCapitals ? 'checked' : ''} />
          </label>
          <label class="switch-row">
            <span>
              <strong>戰鼓與銅鑼音效</strong>
              <small>Web Audio 即時合成低頻戰鼓，無需下載音檔</small>
            </span>
            <input type="checkbox" name="soundEnabled" ${this.settings.soundEnabled ? 'checked' : ''} />
          </label>
        </section>

        <section class="setting-group">
          <h3>自動播放節奏</h3>
          <div class="segmented-control" role="radiogroup" aria-label="自動播放節奏">
            <label class="seg-item">
              <input type="radio" name="playbackSpeed" value="slow" ${this.settings.playbackSpeed === 'slow' ? 'checked' : ''} />
              <span>慢速 4.5s</span>
            </label>
            <label class="seg-item">
              <input type="radio" name="playbackSpeed" value="normal" ${this.settings.playbackSpeed === 'normal' ? 'checked' : ''} />
              <span>標準 3.0s</span>
            </label>
            <label class="seg-item">
              <input type="radio" name="playbackSpeed" value="fast" ${this.settings.playbackSpeed === 'fast' ? 'checked' : ''} />
              <span>快速 1.8s</span>
            </label>
          </div>
        </section>

        <div class="drawer-footer-actions">
          <button type="button" class="btn-secondary" data-action="open-info">歷史與資料說明</button>
          <button type="button" class="btn-secondary" data-action="reset-settings">恢復預設</button>
        </div>
      </div>
    `;

    this.drawerEl.querySelector('[data-action="close-drawer"]').addEventListener('click', () => this.close());
    this.drawerEl.querySelector('[data-action="open-info"]').addEventListener('click', () => {
      this.close();
      this.openInfo();
    });
    this.drawerEl.querySelector('[data-action="reset-settings"]').addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this._syncInputs();
      saveSettings(this.settings);
      this.onChange({ ...this.settings });
    });

    this.drawerEl.addEventListener('change', (e) => {
      const target = e.target;
      if (!target || !target.name) return;
      if (target.type === 'checkbox') {
        this.settings[target.name] = target.checked;
      } else if (target.type === 'radio') {
        this.settings[target.name] = target.value;
      }
      saveSettings(this.settings);
      this.onChange({ ...this.settings });
    });
  }

  _syncInputs() {
    const inputs = this.drawerEl.querySelectorAll('input[name]');
    for (const input of inputs) {
      if (input.type === 'checkbox') {
        input.checked = Boolean(this.settings[input.name]);
      } else if (input.type === 'radio') {
        input.checked = input.value === this.settings[input.name];
      }
    }
  }

  syncExternal(nextSettings) {
    this.settings = { ...nextSettings };
    this._syncInputs();
  }

  _renderInfoModal() {
    const { source, snapshotDate, globalLandKm2 } = this.meta;
    this.infoModalEl.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="info-modal-title">
        <div class="modal-header">
          <h2 id="info-modal-title">歷史背景與資料說明</h2>
          <button type="button" class="btn-close-drawer" data-action="close-info" aria-label="關閉說明">✕</button>
        </div>
        <div class="modal-body">
          <p>
            <strong>為什麼要用「等積投影」看 1900 年庚子宣戰？</strong><br />
            常見的麥卡托投影會把高緯度的俄國、加拿大與歐洲本土極度放大，同時把赤道與南半球的印度、非洲、東南亞和澳洲壓縮。切換為 <em>Equal Earth</em> 等嚴格等積投影後，英、法、德、美、荷、比在低緯度的龐大殖民帝國才會以真實比例攤開在眼前。
          </p>
          <p>
            <strong>《走向共和》台詞 vs 真實《宣戰詔書》</strong><br />
            2003 年歷史劇《走向共和》以極具張力的排比句演出慈禧太后點名向<strong>英、法、美、德、俄、義、奧、日</strong>八國開戰；史實上光緒二十六年五月二十五日（<strong>1900 年 6 月 21 日</strong>）的《對外宣戰詔書》並未逐一唱名，而是針對在京設有使館的 <strong>11 個列強</strong>（多出未派兵參戰的<strong>荷蘭、比利時、西班牙</strong>，最終十一國共同簽署《辛丑條約》）。
          </p>
          <p>
            <strong>1900-06-21 歷史版圖細節</strong><br />
            • 台灣與澎湖已於 1895 年《馬關條約》割讓日本，故隨日本點亮。<br />
            • 朝鮮半島在 1900 年仍為獨立的「大韓帝國」（1910 年方被日併吞）。<br />
            • 利比亞於 1900 年仍屬鄂圖曼帝國（1911 年後才屬義大利）。<br />
            • 剛果自由邦於 1900 年屬比利時國王利奧波德二世私人領地（1908 年移交比國）。<br />
            • 俄國當時首都在聖彼得堡，且新疆界涵蓋芬蘭大公國、波蘭東部與中亞。
          </p>
          <p class="modal-source">
            <strong>地圖資料來源與授權</strong><br />
            邊界精準切片自 <strong>${source.name}</strong>（快照日期：<code>${snapshotDate}</code>；全球非南極可統計政區陸地面積：${Math.round(globalLandKm2 / 10_000).toLocaleString()} 萬 km²），依 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">${source.license}</a> 授權條款公開分享。<br />
            <small>${source.citation}</small>
          </p>
        </div>
      </div>
    `;
    this.infoModalEl.querySelector('[data-action="close-info"]').addEventListener('click', () => this.closeInfo());
    this.infoModalEl.addEventListener('click', (e) => {
      if (e.target === this.infoModalEl) this.closeInfo();
    });
  }

  _bindGlobalEvents() {
    this.backdropEl.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.isInfoOpen) this.closeInfo();
        else if (this.isOpen) this.close();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.drawerEl.classList.add('is-open');
    this.drawerEl.setAttribute('aria-hidden', 'false');
    this.backdropEl.hidden = false;
  }

  close() {
    this.isOpen = false;
    this.drawerEl.classList.remove('is-open');
    this.drawerEl.setAttribute('aria-hidden', 'true');
    this.backdropEl.hidden = true;
  }

  openInfo() {
    this.isInfoOpen = true;
    this.infoModalEl.hidden = false;
  }

  closeInfo() {
    this.isInfoOpen = false;
    this.infoModalEl.hidden = true;
  }
}
