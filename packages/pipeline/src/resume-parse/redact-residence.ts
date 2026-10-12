/**
 * 區級居住地的比對式（D31；resume-import「網址與居住地遮蔽（D31）」）。在 NFKC 後的文字上比對（redact.ts）。
 * - 台灣縣市名（台／臺兩寫法、舊縣名），中間可隔空白，緊接「該縣市」的鄉鎮市區名（tw-districts.ts 名單，
 *   名稱本體接區／市／鎮／鄉任一字尾）；不用「任意字＋區」猜，「台南市東區門市」不會把「門市」吃進去。
 * - 連同緊接其後的地址字樣一起遮：路、街、大道（名稱最多 5 個中文字）、村、里，以及含數字或 * 的
 *   段、巷、弄、號、樓、鄰、室（「之1」「-2」也算），一路接到不再是地址字樣為止。
 * - 只有縣市（「高雄市」「高雄人」）或只有鄉鎮市區（「苓雅區」）不遮。
 */
import { TW_DISTRICTS } from './tw-districts.ts';

/** 「台」「臺」兩種寫法都認。 */
function eitherTai(text: string): string {
  return text.replace(/[台臺]/gu, '[台臺]');
}

const SUFFIX = '[區市鎮鄉]';
const ROAD = String.raw`\p{Script=Han}{1,5}?(?:路|街|大道)`;
const VILLAGE = String.raw`\p{Script=Han}{1,3}?[村里]`;
const UNIT = String.raw`[0-9*一二三四五六七八九十百〇○]+\s*(?:段|巷|弄|號|樓|鄰|室|F)`;
const EXTRA = String.raw`(?:之|-)\s*[0-9]+`;
const TAIL = String.raw`(?:\s*(?:${ROAD}|${UNIT}|${EXTRA}|${VILLAGE}))*`;

function countyPattern(county: string, districts: string): string {
  // 長的名稱先試（「南化」先於「南」），與 regex 回溯無關但讓意圖清楚
  const names = districts
    .split(/\s+/u)
    .filter((d) => d !== '')
    .sort((a, b) => b.length - a.length)
    .map(eitherTai);
  return `${eitherTai(county)}\\s*(?:${names.join('|')})${SUFFIX}`;
}

/** 縣市＋鄉鎮市區（＋地址字樣）的比對式。 */
export const RESIDENCE = new RegExp(
  `(?:${Object.entries(TW_DISTRICTS)
    .map(([county, districts]) => countyPattern(county, districts))
    .join('|')})${TAIL}`,
  'gu',
);
