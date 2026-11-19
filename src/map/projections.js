import { geoEqualEarth, geoMercator } from 'd3-geo';
import { geoEckert4, geoMollweide } from 'd3-geo-projection';

export const PROJECTION_OPTIONS = [
  {
    id: 'equalEarth',
    label: 'Equal Earth（等積・推薦）',
    shortLabel: 'Equal Earth',
    isEqualArea: true,
    description: '2018 年提出的現代等積投影，嚴格保留真實面積比例且大陸輪廓自然均衡。',
  },
  {
    id: 'mollweide',
    label: 'Mollweide（橢圓等積）',
    shortLabel: 'Mollweide',
    isEqualArea: true,
    description: '1805 年經典橢圓形等積投影，極具 19 世紀復古世界輿圖質感。',
  },
  {
    id: 'eckert4',
    label: 'Eckert IV（等積圖集）',
    shortLabel: 'Eckert IV',
    isEqualArea: true,
    description: '高緯度收斂較平緩的等積投影，常見於歷史地圖集與百科全書。',
  },
  {
    id: 'mercator',
    label: 'Mercator（麥卡托對照）',
    shortLabel: 'Mercator',
    isEqualArea: false,
    description: '航海常用保角投影，但會嚴重誇大高緯度面積（如俄國、加拿大、格陵蘭），僅作失真對照。',
  },
];

export const CENTER_OPTIONS = [
  {
    id: 'europe',
    label: '歐非居中（無裁切全景）',
    shortLabel: '歐非居中',
    rotate: [-11, 0],
    description: '從太平洋白令海峽切開，歐亞非與美洲完全不被裁切，最適合看殖民帝國全貌。',
  },
  {
    id: 'eastAsia',
    label: '東亞居中（四面包圍視角）',
    shortLabel: '東亞居中',
    rotate: [-150, 0],
    description: '以大清與太平洋為視覺核心，直觀感受北俄、東日、東南美澳、西南英法的合圍態勢。',
  },
];

const FACTORIES = {
  equalEarth: geoEqualEarth,
  mollweide: geoMollweide,
  eckert4: geoEckert4,
  mercator: geoMercator,
};

const MERCATOR_LAT_MIN = -58;
const MERCATOR_LAT_MAX = 78;

function mercatorY(latDeg) {
  const rad = (latDeg * Math.PI) / 180;
  return -Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

export function createProjection({
  projectionId = 'equalEarth',
  centerId = 'europe',
  width = 960,
  height = 520,
  padding = 16,
}) {
  const centerOpt = CENTER_OPTIONS.find((c) => c.id === centerId) || CENTER_OPTIONS[0];
  const rotate = centerOpt.rotate;
  const factory = FACTORIES[projectionId] || geoEqualEarth;

  if (projectionId === 'mercator') {
    const rawTop = mercatorY(MERCATOR_LAT_MAX);
    const rawBottom = mercatorY(MERCATOR_LAT_MIN);
    const spanY = rawBottom - rawTop;
    const spanX = 2 * Math.PI;
    const usableW = Math.max(120, width - padding * 2);
    const usableH = Math.max(120, height - padding * 2);
    const scale = Math.min(usableW / spanX, usableH / spanY);
    const tx = width / 2;
    const ty = height / 2 - scale * ((rawTop + rawBottom) / 2);

    const projection = geoMercator()
      .rotate(rotate)
      .scale(scale)
      .translate([tx, ty])
      .precision(0.4);

    const clipBox = {
      x: tx - scale * Math.PI,
      y: ty + scale * rawTop,
      width: scale * spanX,
      height: scale * spanY,
    };

    return {
      projection,
      isMercator: true,
      clipBox,
      meta: PROJECTION_OPTIONS.find((p) => p.id === projectionId),
      centerMeta: centerOpt,
    };
  }

  const projection = factory().rotate(rotate).precision(0.4);
  projection.fitExtent(
    [
      [padding, padding],
      [Math.max(padding + 100, width - padding), Math.max(padding + 100, height - padding)],
    ],
    { type: 'Sphere' }
  );

  return {
    projection,
    isMercator: false,
    clipBox: null,
    meta: PROJECTION_OPTIONS.find((p) => p.id === projectionId),
    centerMeta: centerOpt,
  };
}
