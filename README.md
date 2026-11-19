# 1900 庚子宣戰・等積投影世界互動地圖

在**等積投影**世界地圖上，從 1900 年的大清帝國出發，依歷史劇《走向共和》慈禧太后宣戰順序（以及史實《宣戰詔書》／《辛丑條約》十一國名單），逐一點亮各列強在 **1900 年 6 月 21 日**的真實全球版圖與殖民帝國。

線上體驗：<https://dedh121224.github.io/qing-1900-war-map/>

## 特色亮點

- **拒絕麥卡托面積失真**：預設採用嚴格等積的 **Equal Earth** 投影（並支援 **Mollweide**、**Eckert IV** 與 **Mercator** 失真對照），直接對比低緯度殖民帝國與高緯度疆域的真實尺度。
- **1900-06-21 精準歷史快照**：依據 ETH Zurich **CShapes 2.0** 精準切片光緒二十六年五月二十五日宣戰當日全球版圖：
  - **台灣**因 1895 年《馬關條約》已割讓日本，隨日本點亮而非大清。
  - **大韓帝國**在 1900 年仍為獨立國家，不屬於日本。
  - **利比亞**在 1900 年仍屬鄂圖曼帝國，不屬於義大利。
  - **俄國**首都標示為聖彼得堡；**奧匈帝國**含託管中之波士尼亞與赫塞哥維納。
  - 十一國模式下，**剛果自由邦**以斜紋特別標示「比利時國王利奧波德二世私領（1908 始併入比國）」。
- **高度客製化互動開關**：
  - 視覺風格：**深色電影特展** / **復古羊皮紙輿圖**
  - 視角中心：**歐非居中（零大陸裁切）** / **東亞居中（四面合圍視角）**
  - 宣戰名單：**《走向共和》劇版 8 國** / **史實 11 國（含荷、比、西）**
  - 領土範圍：**含殖民地與自治領** / **僅顯示本土**
  - 圖層與動效：**本土 → 殖民地兩段式展開**、**東南互保諸省斜紋**、**首都脈衝光點**、**Web Audio 合成戰鼓與銅鑼音效**
- **行動端 RWD 體驗**：適配 `100dvh` 手機直屏與橫屏、支援雙指縮放、點擊查詢各地區 1900 真實面積與歷史註解、Bottom Sheet 設定抽屜。

## 本機開發

```bash
npm install
npm run dev
npm run build
```

若需重新從原始 CShapes 2.0 GeoJSON 切片產出 `public/data/world-1900.topo.json`，將 `CShapes-2.0.geojson` 置於 `raw-data/` 後執行：

```bash
npm run prepare-data
```

## 資料來源與授權

本專案所用 1900 年全球國家與殖民地界線精準切片自 **CShapes 2.0**（ETH Zurich International Conflict Research），依 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)** 授權條款發布：

> Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils B. Weidmann, and Kristian Skrede Gleditsch (2022). *Mapping The International System, 1886–2019: The CShapes 2.0 Dataset*. Journal of Conflict Resolution. <https://icr.ethz.ch/data/cshapes/>
