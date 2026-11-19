import fs from 'node:fs';
import path from 'node:path';
import { geoArea, geoCentroid } from 'd3-geo';

const EARTH_RADIUS_KM = 6371.0088;
const STERADIAN_TO_KM2 = EARTH_RADIUS_KM * EARTH_RADIUS_KM;

const rawPath = path.resolve('raw-data/CShapes-2.0.geojson');
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

const propKeys = new Set();
for (const f of raw.features) {
  for (const k of Object.keys(f.properties || {})) {
    propKeys.add(k);
  }
}
console.log('Total features:', raw.features.length);
console.log('All property keys:', [...propKeys].join(', '));

function toDateNum(y, m, d) {
  return y * 10000 + m * 100 + d;
}

const TARGET = 19000621;
const active = [];

for (let i = 0; i < raw.features.length; i++) {
  const f = raw.features[i];
  const p = f.properties || {};
  const start = toDateNum(p.gwsyear, p.gwsmonth, p.gwsday);
  const end = toDateNum(p.gweyear, p.gwemonth, p.gweday);
  if (start <= TARGET && TARGET <= end) {
    const areaSr = geoArea(f);
    const areaKm2 = Math.round(areaSr * STERADIAN_TO_KM2);
    const centroid = geoCentroid(f).map((n) => (Number.isFinite(n) ? Number(n.toFixed(2)) : n));
    const polyCount =
      f.geometry?.type === 'MultiPolygon'
        ? f.geometry.coordinates.length
        : f.geometry?.type === 'Polygon'
          ? 1
          : 0;
    const reversed = areaSr > 2 * Math.PI;
    active.push({
      i,
      gwcode: p.gwcode,
      cntry_name: p.cntry_name,
      status: p.status ?? null,
      owner: p.owner ?? null,
      propArea: p.area,
      geoAreaKm2: areaKm2,
      centroid,
      polyCount,
      reversed,
      start,
      end,
    });
  }
}

console.log(`\nActive on 1900-06-21: ${active.length} features`);
let sumPropArea = 0;
let sumGeoArea = 0;
for (const a of active) {
  sumPropArea += Number(a.propArea) || 0;
  sumGeoArea += a.geoAreaKm2;
  console.log(
    `[${a.i}] gw=${a.gwcode} name=${JSON.stringify(a.cntry_name)} | status=${a.status} owner=${a.owner} | propArea=${a.propArea} | geoArea=${a.geoAreaKm2} | poly=${a.polyCount} | centroid=${JSON.stringify(a.centroid)}${a.reversed ? ' [REVERSED]' : ''}`
  );
}
console.log(`\nSum propArea: ${Math.round(sumPropArea)} km2`);
console.log(`Sum geoArea: ${Math.round(sumGeoArea)} km2`);
