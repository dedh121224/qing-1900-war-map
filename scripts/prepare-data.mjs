import fs from 'node:fs';
import path from 'node:path';
import { geoArea } from 'd3-geo';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { feature as topoToFeature, quantize } from 'topojson-client';

const EARTH_RADIUS_KM = 6371.0088;
const STERADIAN_TO_KM2 = EARTH_RADIUS_KM * EARTH_RADIUS_KM;
const TARGET_DATE = 19000621; // 光緒二十六年五月二十五日（1900-06-21）清廷發布《對外宣戰詔書》當日

const RAW_PATH = path.resolve('raw-data/CShapes-2.0.geojson');
const OUT_TOPO_PATH = path.resolve('public/data/world-1900.topo.json');
const OUT_META_PATH = path.resolve('public/data/world-1900-meta.json');

/**
 * 1900-06-21 全球 151 筆政區之勢力歸屬、層級與繁體中文歷史譯名對照表（依 gwcode 對應）。
 */
const CLASSIFICATION = {
  // === 大清帝國 ===
  710: {
    power: 'qing',
    tier: 'qing',
    zhName: '大清帝國',
    enName: 'Qing Empire (China)',
    note: '含東北、外蒙古、唐努烏梁海、新疆與西藏；台灣與澎湖已於 1895 年《馬關條約》割讓日本。',
  },

  // === 1. 英吉利國（大英帝國） ===
  200: {
    power: 'uk',
    tier: 'metropole',
    zhName: '大不列顛及愛爾蘭聯合王國（本土）',
    enName: 'United Kingdom of Great Britain and Ireland',
  },
  20: { power: 'uk', tier: 'colony', zhName: '加拿大自治領（英屬）', enName: 'Dominion of Canada' },
  21: { power: 'uk', tier: 'colony', zhName: '紐芬蘭自治領（英屬）', enName: 'Dominion of Newfoundland' },
  31: { power: 'uk', tier: 'colony', zhName: '巴哈馬（英屬）', enName: 'Bahamas (UK)' },
  51: { power: 'uk', tier: 'colony', zhName: '牙買加（英屬）', enName: 'Jamaica (UK)' },
  52: { power: 'uk', tier: 'colony', zhName: '千里達及托巴哥（英屬）', enName: 'Trinidad and Tobago (UK)' },
  53: { power: 'uk', tier: 'colony', zhName: '巴貝多（英屬）', enName: 'Barbados (UK)' },
  80: { power: 'uk', tier: 'colony', zhName: '英屬宏都拉斯（貝里斯）', enName: 'British Honduras' },
  110: { power: 'uk', tier: 'colony', zhName: '英屬圭亞那', enName: 'British Guiana' },
  338: { power: 'uk', tier: 'colony', zhName: '馬爾他（英屬）', enName: 'Malta (UK)' },
  420: { power: 'uk', tier: 'colony', zhName: '甘比亞（英屬）', enName: 'The Gambia (UK)' },
  451: { power: 'uk', tier: 'colony', zhName: '獅子山（英屬）', enName: 'Sierra Leone (UK)' },
  452: { power: 'uk', tier: 'colony', zhName: '黃金海岸（今迦納・英屬）', enName: 'Gold Coast (UK)' },
  4781: { power: 'uk', tier: 'colony', zhName: '拉哥斯殖民地（英屬）', enName: 'Lagos Colony (UK)' },
  4783: { power: 'uk', tier: 'colony', zhName: '南奈及利亞保護國（英屬）', enName: 'Southern Nigeria Protectorate' },
  4784: { power: 'uk', tier: 'colony', zhName: '北奈及利亞保護國（英屬）', enName: 'Northern Nigeria Protectorate' },
  500: { power: 'uk', tier: 'colony', zhName: '烏干達保護國（英屬）', enName: 'Uganda Protectorate (UK)' },
  501: { power: 'uk', tier: 'colony', zhName: '英屬東非（今肯亞）', enName: 'East Africa Protectorate (UK)' },
  511: { power: 'uk', tier: 'colony', zhName: '尚吉巴保護國（英屬）', enName: 'Sultanate of Zanzibar (UK)' },
  521: { power: 'uk', tier: 'colony', zhName: '英屬索馬利蘭', enName: 'British Somaliland' },
  552: { power: 'uk', tier: 'colony', zhName: '南羅德西亞（英屬）', enName: 'Southern Rhodesia (UK)' },
  553: { power: 'uk', tier: 'colony', zhName: '英屬中非（今馬拉威）', enName: 'British Central Africa' },
  5518: { power: 'uk', tier: 'colony', zhName: '東北羅德西亞（英屬）', enName: 'North-Eastern Rhodesia (UK)' },
  5519: { power: 'uk', tier: 'colony', zhName: '西北羅德西亞（英屬）', enName: 'North-Western Rhodesia (UK)' },
  561: { power: 'uk', tier: 'colony', zhName: '開普殖民地（英屬）', enName: 'Cape Colony (UK)' },
  562: { power: 'uk', tier: 'colony', zhName: '納塔爾殖民地（英屬）', enName: 'Colony of Natal (UK)' },
  570: { power: 'uk', tier: 'colony', zhName: '巴蘇陀蘭（今賴索托・英屬）', enName: 'Basutoland (UK)' },
  571: { power: 'uk', tier: 'colony', zhName: '貝專納保護國（今波札那・英屬）', enName: 'Bechuanaland Protectorate (UK)' },
  572: {
    power: 'uk',
    tier: 'colony',
    zhName: '史瓦濟蘭（英保護／波耳戰區）',
    enName: 'Swaziland',
    note: '1900 年第二次波耳戰爭期間逐步由英國接管為保護國。',
  },
  590: { power: 'uk', tier: 'colony', zhName: '模里西斯（英屬）', enName: 'British Mauritius' },
  625: {
    power: 'uk',
    tier: 'colony',
    zhName: '英埃共管蘇丹',
    enName: 'Anglo-Egyptian Sudan',
    note: '1899 年起由英國實質主導之英埃共管區。',
  },
  651: {
    power: 'uk',
    tier: 'colony',
    zhName: '埃及（英國實質佔領保護）',
    enName: 'Egypt (British-occupied)',
    note: '名義仍屬鄂圖曼帝國，但自 1882 年起長期由英國駐軍並實質掌控軍政。',
  },
  696: { power: 'uk', tier: 'colony', zhName: '特魯西爾阿曼（今阿聯・英保護國）', enName: 'Trucial States (UK)' },
  750: {
    power: 'uk',
    tier: 'colony',
    zhName: '英屬印度（含今印・巴・孟・緬）',
    enName: 'British Raj (India & Burma)',
    note: '1900 年英屬印度版圖涵蓋今日印度、巴基斯坦、孟加拉與緬甸。',
  },
  780: { power: 'uk', tier: 'colony', zhName: '錫蘭（今斯里蘭卡・英屬）', enName: 'British Ceylon' },
  781: { power: 'uk', tier: 'colony', zhName: '馬爾地夫（英保護國）', enName: 'Maldives (UK Protectorate)' },
  821: { power: 'uk', tier: 'colony', zhName: '馬來聯邦（英保護國）', enName: 'Federated Malay States (UK)' },
  822: { power: 'uk', tier: 'colony', zhName: '馬來屬邦（英保護國）', enName: 'Unfederated Malay States (UK)' },
  823: { power: 'uk', tier: 'colony', zhName: '英屬北婆羅洲（沙巴）', enName: 'North Borneo (UK)' },
  824: { power: 'uk', tier: 'colony', zhName: '砂拉越王國（英保護國）', enName: 'Raj of Sarawak (UK)' },
  827: {
    power: 'uk',
    tier: 'colony',
    zhName: '海峽殖民地（新加坡・麻六甲・檳城）',
    enName: 'Straits Settlements (UK)',
  },
  835: { power: 'uk', tier: 'colony', zhName: '汶萊（英保護國）', enName: 'Brunei (UK Protectorate)' },
  901: { power: 'uk', tier: 'colony', zhName: '新南威爾斯殖民地（英屬澳洲）', enName: 'New South Wales (UK)' },
  902: { power: 'uk', tier: 'colony', zhName: '西澳殖民地（英屬澳洲）', enName: 'Western Australia (UK)' },
  903: { power: 'uk', tier: 'colony', zhName: '南澳殖民地（含北領地・英屬）', enName: 'South Australia (UK)' },
  904: { power: 'uk', tier: 'colony', zhName: '維多利亞殖民地（英屬澳洲）', enName: 'Victoria (UK)' },
  905: { power: 'uk', tier: 'colony', zhName: '昆士蘭殖民地（英屬澳洲）', enName: 'Queensland (UK)' },
  906: { power: 'uk', tier: 'colony', zhName: '塔斯馬尼亞殖民地（英屬澳洲）', enName: 'Tasmania (UK)' },
  911: { power: 'uk', tier: 'colony', zhName: '英屬新幾內亞（巴布亞）', enName: 'British New Guinea' },
  920: { power: 'uk', tier: 'colony', zhName: '紐西蘭殖民地（英屬）', enName: 'Colony of New Zealand (UK)' },
  940: { power: 'uk', tier: 'colony', zhName: '英屬索羅門群島', enName: 'British Solomon Islands' },
  950: { power: 'uk', tier: 'colony', zhName: '斐濟殖民地（英屬）', enName: 'Colony of Fiji (UK)' },

  // === 2. 法蘭西國（法蘭西第三共和國） ===
  220: { power: 'france', tier: 'metropole', zhName: '法蘭西第三共和國（本土）', enName: 'French Third Republic' },
  65: { power: 'france', tier: 'colony', zhName: '瓜地洛普（法屬）', enName: 'Guadeloupe (France)' },
  66: { power: 'france', tier: 'colony', zhName: '馬丁尼克（法屬）', enName: 'Martinique (France)' },
  120: { power: 'france', tier: 'colony', zhName: '法屬圭亞那', enName: 'French Guiana' },
  430: { power: 'france', tier: 'colony', zhName: '法屬西非', enName: 'French West Africa' },
  433: { power: 'france', tier: 'colony', zhName: '塞內加爾（法屬西非）', enName: 'Senegal (France)' },
  434: { power: 'france', tier: 'colony', zhName: '達荷美（今貝南・法屬）', enName: 'French Dahomey' },
  437: { power: 'france', tier: 'colony', zhName: '象牙海岸（法屬）', enName: 'French Ivory Coast' },
  438: { power: 'france', tier: 'colony', zhName: '法屬幾內亞', enName: 'French Guinea' },
  481: { power: 'france', tier: 'colony', zhName: '加彭（法屬剛果）', enName: 'French Gabon' },
  484: { power: 'france', tier: 'colony', zhName: '法屬剛果／赤道非洲', enName: 'French Congo' },
  522: { power: 'france', tier: 'colony', zhName: '法屬索馬利蘭（吉布地）', enName: 'French Somaliland' },
  580: { power: 'france', tier: 'colony', zhName: '馬達加斯加（法屬）', enName: 'French Madagascar' },
  585: { power: 'france', tier: 'colony', zhName: '留尼旺（法屬）', enName: 'Réunion (France)' },
  615: { power: 'france', tier: 'colony', zhName: '法屬阿爾及利亞', enName: 'French Algeria' },
  616: { power: 'france', tier: 'colony', zhName: '突尼西亞（法保護國）', enName: 'French Tunisia' },
  811: { power: 'france', tier: 'colony', zhName: '柬埔寨（法屬印度支那）', enName: 'Cambodia (French Indochina)' },
  812: { power: 'france', tier: 'colony', zhName: '寮國（法屬印度支那）', enName: 'Laos (French Indochina)' },
  815: {
    power: 'france',
    tier: 'colony',
    zhName: '越南（東京・安南・交趾支那・法屬）',
    enName: 'Vietnam (French Indochina)',
  },
  930: { power: 'france', tier: 'colony', zhName: '新喀里多尼亞（法屬）', enName: 'New Caledonia (France)' },

  // === 3. 美利堅國（美利堅合眾國） ===
  2: { power: 'usa', tier: 'metropole', zhName: '美利堅合眾國（本土）', enName: 'United States of America (Contiguous)' },
  3: {
    power: 'usa',
    tier: 'colony',
    zhName: '阿拉斯加領地（美屬）',
    enName: 'District of Alaska (US Territory)',
    note: '1867 年購自俄國；1900 年仍為未建州之美國領地（1959 始成第 49 州）。',
  },
  4: {
    power: 'usa',
    tier: 'colony',
    zhName: '夏威夷領地（美屬）',
    enName: 'Territory of Hawaii (US)',
    note: '1898 年正式併入美國領地（1959 始成第 50 州）。',
  },
  6: {
    power: 'usa',
    tier: 'colony',
    zhName: '波多黎各（美屬海外領地）',
    enName: 'Puerto Rico (US Territory)',
    note: '1898 年美西戰爭後自西班牙割讓予美國。',
  },
  840: {
    power: 'usa',
    tier: 'colony',
    zhName: '美屬菲律賓',
    enName: 'Philippines (US Territory)',
    note: '1898 年美西戰爭後自西班牙割讓予美國，1900 年仍處美菲戰爭期間。',
  },

  // === 4. 德意志國（德意志帝國） ===
  255: {
    power: 'germany',
    tier: 'metropole',
    zhName: '德意志帝國（本土）',
    enName: 'German Empire',
    note: '含亞爾薩斯-洛林、波蘭西部與東普魯士；另在山東擁有膠州灣租借地。',
  },
  460: { power: 'germany', tier: 'colony', zhName: '德屬多哥蘭', enName: 'German Togoland' },
  470: { power: 'germany', tier: 'colony', zhName: '德屬喀麥隆', enName: 'German Kamerun' },
  510: { power: 'germany', tier: 'colony', zhName: '德屬東非（今坦尚尼亞等）', enName: 'German East Africa' },
  565: { power: 'germany', tier: 'colony', zhName: '德屬西南非（今納米比亞）', enName: 'German South-West Africa' },
  912: { power: 'germany', tier: 'colony', zhName: '德屬新幾內亞（威廉皇帝地）', enName: 'German New Guinea' },

  // === 5. 俄羅斯國（俄羅斯帝國） ===
  365: {
    power: 'russia',
    tier: 'metropole',
    zhName: '俄羅斯帝國（含芬蘭・波蘭・中亞・西伯利亞）',
    enName: 'Russian Empire',
    note: '1900 年首都為聖彼得堡，疆域涵蓋芬蘭大公國、波蘭會議王國、高加索、中亞與西伯利亞。',
  },
  7020: { power: 'russia', tier: 'colony', zhName: '布哈拉埃米爾國（俄保護國）', enName: 'Emirate of Bukhara (Russian Protectorate)' },
  7030: { power: 'russia', tier: 'colony', zhName: '希瓦汗國（俄保護國）', enName: 'Khanate of Khiva (Russian Protectorate)' },

  // === 6. 義大利國（義大利王國） ===
  325: {
    power: 'italy',
    tier: 'metropole',
    zhName: '義大利王國（本土）',
    enName: 'Kingdom of Italy',
    note: '註：1900 年利比亞仍屬鄂圖曼帝國，1911 年意土戰爭後才被義大利佔領。',
  },
  531: { power: 'italy', tier: 'colony', zhName: '義屬厄利垂亞', enName: 'Italian Eritrea' },
  5200: { power: 'italy', tier: 'colony', zhName: '義屬索馬利蘭', enName: 'Italian Somaliland' },

  // === 7. 奧地利國（奧匈帝國） ===
  300: { power: 'austria', tier: 'metropole', zhName: '奧匈帝國（本土）', enName: 'Austria-Hungary' },
  3461: {
    power: 'austria',
    tier: 'colony',
    zhName: '波士尼亞（奧匈帝國託管佔領）',
    enName: 'Bosnia (Austro-Hungarian Condominium)',
    note: '1878 年柏林會議起由奧匈帝國實質軍政佔領並管理（1908 正式兼併）。',
  },
  3462: {
    power: 'austria',
    tier: 'colony',
    zhName: '赫塞哥維納（奧匈帝國託管佔領）',
    enName: 'Herzegovina (Austro-Hungarian Condominium)',
    note: '1878 年起與波士尼亞同由奧匈帝國實質佔領管理。',
  },

  // === 8. 日本國（大日本帝國） ===
  740: {
    power: 'japan',
    tier: 'metropole',
    zhName: '大日本帝國（本土・含琉球及千島）',
    enName: 'Empire of Japan',
  },
  713: {
    power: 'japan',
    tier: 'colony',
    zhName: '日治台灣（1895 割讓日本）',
    enName: 'Taiwan (Japanese Rule)',
    note: '1895 年《馬關條約》由大清割讓予日本，因此 1900 年隨日本而非大清點亮。',
  },

  // === 9. 荷蘭王國（史實十一國） ===
  210: { power: 'netherlands', tier: 'metropole', zhName: '荷蘭王國（本土）', enName: 'Kingdom of the Netherlands' },
  850: { power: 'netherlands', tier: 'colony', zhName: '荷屬東印度（今印尼群島）', enName: 'Dutch East Indies' },
  115: { power: 'netherlands', tier: 'colony', zhName: '荷屬圭亞那（蘇利南）', enName: 'Surinam (Dutch Guiana)' },

  // === 10. 比利時王國（史實十一國） ===
  211: { power: 'belgium', tier: 'metropole', zhName: '比利時王國（本土）', enName: 'Kingdom of Belgium' },
  490: {
    power: 'belgium',
    tier: 'personal',
    zhName: '剛果自由邦（比王私領）',
    enName: 'Congo Free State',
    note: '1900 年為比利時國王利奧波德二世私人領地，面積逾本土 75 倍，至 1908 年才正式移交比國政府。',
  },

  // === 11. 西班牙王國（史實十一國） ===
  230: {
    power: 'spain',
    tier: 'metropole',
    zhName: '西班牙王國（本土）',
    enName: 'Kingdom of Spain',
    note: '1898 年美西戰爭剛失去古巴、波多黎各與菲律賓。',
  },
  411: { power: 'spain', tier: 'colony', zhName: '西屬幾內亞', enName: 'Spanish Guinea' },
  610: { power: 'spain', tier: 'colony', zhName: '西屬撒哈拉（里奧德奧羅）', enName: 'Spanish West Africa' },
};

/**
 * 中立國及非宣戰地區中文譯名（強化懸停探索體驗）
 */
const NEUTRAL_NAMES = {
  40: { zhName: '古巴（1900 美軍託管過渡期）', note: '1898 年脫離西班牙，1902 年正式建國獨立。' },
  41: { zhName: '海地' },
  42: { zhName: '多明尼加' },
  70: { zhName: '墨西哥' },
  90: { zhName: '瓜地馬拉' },
  91: { zhName: '宏都拉斯' },
  92: { zhName: '薩爾瓦多' },
  93: { zhName: '尼加拉瓜' },
  94: { zhName: '哥斯大黎加' },
  100: { zhName: '哥倫比亞（含巴拿馬）' },
  101: { zhName: '委內瑞拉' },
  130: { zhName: '厄瓜多' },
  135: { zhName: '秘魯' },
  140: { zhName: '巴西第一共和國' },
  145: { zhName: '玻利維亞' },
  150: { zhName: '巴拉圭' },
  155: { zhName: '智利' },
  160: { zhName: '阿根廷' },
  165: { zhName: '烏拉圭' },
  212: { zhName: '盧森堡' },
  225: { zhName: '瑞士' },
  235: { zhName: '葡萄牙王國（本土）' },
  340: { zhName: '塞爾維亞王國' },
  341: { zhName: '蒙特內哥羅公國' },
  350: { zhName: '希臘王國' },
  355: { zhName: '保加利亞公國' },
  360: { zhName: '羅馬尼亞王國' },
  380: { zhName: '瑞典－挪威聯合王國' },
  390: { zhName: '丹麥王國' },
  395: { zhName: '冰島（丹麥屬）' },
  402: { zhName: '維德角（葡屬）' },
  404: { zhName: '葡屬幾內亞' },
  450: { zhName: '賴比瑞亞' },
  530: { zhName: '衣索比亞帝國（阿比西尼亞）', note: '1896 年擊退義大利後維持非洲極少數獨立主權國家地位。' },
  540: { zhName: '葡屬安哥拉' },
  541: { zhName: '葡屬東非（莫三比克）' },
  563: { zhName: '德蘭士瓦共和國（南非共和國）', note: '1900 年 6 月正與大英帝國進行第二次波耳戰爭。' },
  564: { zhName: '奧蘭治自由邦', note: '1900 年波耳戰爭戰區，同年稍早已被英軍攻佔並宣告兼併。' },
  600: { zhName: '摩洛哥蘇丹國', note: '1900 年仍為獨立蘇丹國（1912 年方淪為法西保護國）。' },
  630: { zhName: '波斯帝國（卡扎爾王朝）' },
  640: { zhName: '鄂圖曼帝國', note: '1900 年疆域仍包含安納托利亞、黎凡特、美索不達米亞、漢志與利比亞。' },
  698: { zhName: '阿曼蘇丹國' },
  700: { zhName: '阿富汗酋長國' },
  730: { zhName: '大韓帝國', note: '1900 年仍為主權獨立國；1910 年《日韓合併條約》後才併入日本。' },
  760: { zhName: '不丹' },
  790: { zhName: '尼泊爾王國' },
  800: { zhName: '暹羅王國（今泰國）', note: '東南亞唯一未淪為西方殖民地之獨立王國。' },
  860: { zhName: '葡屬帝汶' },
};

function toDateNum(y, m, d) {
  return y * 10000 + m * 100 + d;
}

/**
 * 將 GeoJSON 環方向正規化為 D3 球面慣例：外環順時針（geoArea < 2π）、內洞逆時針（geoArea > 2π）。
 */
function fixGeometryWinding(geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  const fixedPolys = polys.map((poly) =>
    poly.map((ring, ringIdx) => {
      const a = geoArea({ type: 'Polygon', coordinates: [ring] });
      if (ringIdx === 0) {
        return a > 2 * Math.PI ? [...ring].reverse() : ring;
      }
      return a < 2 * Math.PI ? [...ring].reverse() : ring;
    })
  );
  return geom.type === 'MultiPolygon'
    ? { type: 'MultiPolygon', coordinates: fixedPolys }
    : { type: 'Polygon', coordinates: fixedPolys[0] };
}

function assertRange(label, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`面積斷言失敗 [${label}]: ${Math.round(value)} km2 不在 [${min}, ${max}] 區間`);
  }
}

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
const activeRaw = raw.features.filter((f) => {
  const p = f.properties || {};
  return toDateNum(p.gwsyear, p.gwsmonth, p.gwsday) <= TARGET_DATE &&
    TARGET_DATE <= toDateNum(p.gweyear, p.gwemonth, p.gweday);
});

if (activeRaw.length === 0) {
  throw new Error('CShapes 2.0 在 1900-06-21 未切出任何政區！');
}

const powerTotals = {};
let globalLandKm2 = 0;

const preparedFeatures = activeRaw.map((f) => {
  const p = f.properties;
  const gwcode = Number(p.gwcode);
  const fixedGeom = fixGeometryWinding(f.geometry);
  const areaSr = geoArea(fixedGeom);

  if (!Number.isFinite(areaSr) || areaSr <= 0 || areaSr > 2 * Math.PI) {
    throw new Error(`繞向修正後面積仍異常: gwcode=${gwcode} (${p.cntry_name}), areaSr=${areaSr}`);
  }

  const areaKm2 = Math.round(areaSr * STERADIAN_TO_KM2);
  globalLandKm2 += areaKm2;

  const cls = CLASSIFICATION[gwcode];
  const neutralMeta = NEUTRAL_NAMES[gwcode];
  const power = cls ? cls.power : 'neutral';
  const tier = cls ? cls.tier : 'neutral';
  const zhName = cls ? cls.zhName : neutralMeta?.zhName || p.cntry_name;
  const enName = cls ? cls.enName : p.cntry_name;
  const note = cls?.note || neutralMeta?.note || '';

  if (!powerTotals[power]) {
    powerTotals[power] = {
      power,
      metropoleKm2: 0,
      colonyKm2: 0,
      personalKm2: 0,
      totalKm2: 0,
      featureCount: 0,
    };
  }
  const bucket = powerTotals[power];
  bucket.featureCount += 1;
  bucket.totalKm2 += areaKm2;
  if (tier === 'metropole' || tier === 'qing') {
    bucket.metropoleKm2 += areaKm2;
  } else if (tier === 'personal') {
    bucket.personalKm2 += areaKm2;
  } else if (tier === 'colony') {
    bucket.colonyKm2 += areaKm2;
  }

  return {
    type: 'Feature',
    properties: {
      id: `gw-${gwcode}`,
      gwcode,
      power,
      tier,
      zhName,
      enName,
      note,
      areaKm2,
    },
    geometry: fixedGeom,
  };
});

// 合理性面積斷言
assertRange('globalLandKm2', globalLandKm2, 125_000_000, 142_000_000);
assertRange('qing', powerTotals.qing?.totalKm2, 9_500_000, 12_500_000);
assertRange('uk', powerTotals.uk?.totalKm2, 25_000_000, 35_000_000);
assertRange('russia', powerTotals.russia?.totalKm2, 19_000_000, 24_000_000);
assertRange('france', powerTotals.france?.totalKm2, 9_000_000, 13_500_000);
assertRange('usa', powerTotals.usa?.totalKm2, 8_500_000, 10_800_000);
assertRange('germany', powerTotals.germany?.totalKm2, 2_600_000, 3_600_000);
assertRange('belgium', powerTotals.belgium?.totalKm2, 2_200_000, 2_600_000);
assertRange('netherlands', powerTotals.netherlands?.totalKm2, 1_800_000, 2_200_000);
assertRange('japan', powerTotals.japan?.totalKm2, 380_000, 500_000);

const taiwanFeature = preparedFeatures.find((f) => f.properties.gwcode === 713);
if (!taiwanFeature || taiwanFeature.properties.power !== 'japan' || taiwanFeature.properties.tier !== 'colony') {
  throw new Error('台灣（gw=713）在 1900 年必須歸屬於日本殖民領地！');
}

const fc = { type: 'FeatureCollection', features: preparedFeatures };

// TopoJSON 建構、保拓撲簡化與量化
let topo = topology({ regions: fc });
topo = presimplify(topo);
const threshold = quantile(topo, 0.35);
topo = simplify(topo, threshold);
topo = quantize(topo, 1e5);

// 驗證簡化後還原為 GeoJSON 仍無 NaN 與繞向反轉
const checkFc = topoToFeature(topo, topo.objects.regions);
for (const f of checkFc.features) {
  const a = geoArea(f);
  if (!Number.isFinite(a) || a > 2 * Math.PI) {
    throw new Error(`TopoJSON 簡化還原後異常: ${f.properties.zhName}, areaSr=${a}`);
  }
}

fs.mkdirSync(path.dirname(OUT_TOPO_PATH), { recursive: true });
const topoStr = JSON.stringify(topo);
fs.writeFileSync(OUT_TOPO_PATH, topoStr, 'utf8');

const meta = {
  snapshotDate: '1900-06-21',
  source: {
    name: 'CShapes 2.0 (ETH Zurich International Conflict Research)',
    citation: 'Schvitz, Guy, Seraina Rüegger, Luc Girardin, Lars-Erik Cederman, Nils B. Weidmann, and Kristian Skrede Gleditsch (2022). Mapping The International System, 1886–2019: The CShapes 2.0 Dataset. Journal of Conflict Resolution.',
    url: 'https://icr.ethz.ch/data/cshapes/',
    license: 'CC BY-NC-SA 4.0',
  },
  noteGlobalArea: '全球非南極可統計政區陸地總面積依 CShapes 2.0 之 1900-06-21 政區幾何以球面面積計算（不含無人南極洲與未編碼荒島）。',
  featureCount: preparedFeatures.length,
  globalLandKm2,
  powers: powerTotals,
};
fs.writeFileSync(OUT_META_PATH, JSON.stringify(meta, null, 2), 'utf8');

const sizeKb = (topoStr.length / 1024).toFixed(1);
console.log(`✅ 產出成功！政區數=${preparedFeatures.length}，TopoJSON=${sizeKb} KB`);
console.log(`🌍 全球陸地總面積（不含南極）：${globalLandKm2.toLocaleString()} km²`);
for (const key of ['qing', 'uk', 'france', 'usa', 'germany', 'russia', 'italy', 'austria', 'japan', 'netherlands', 'belgium', 'spain']) {
  const p = powerTotals[key];
  const pct = ((p.totalKm2 / globalLandKm2) * 100).toFixed(2);
  console.log(
    `  - ${key.padEnd(11)}: 總計 ${p.totalKm2.toLocaleString().padStart(10)} km² (${pct}%) | 本土 ${p.metropoleKm2.toLocaleString()} | 海外/屬地 ${(p.colonyKm2 + p.personalKm2).toLocaleString()}`
  );
}
if (topoStr.length < 300_000 || topoStr.length > 1_200_000) {
  console.warn(`⚠️ TopoJSON 體積 (${sizeKb} KB) 超出預設目標 300~850 KB，請留意`);
}
