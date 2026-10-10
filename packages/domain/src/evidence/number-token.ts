/** 數字擷取共用的型別與小工具（R1 檢查 3）。 */
import { displayText } from './number-normalize.ts';

export interface NumberToken {
  /** 原文（正規化後） */
  readonly text: string;
  /** 比對用 key；無法確定解析時為 null，一律視為找不到出處 */
  readonly key: string | null;
}

/** 一般數字、百分比、百分點分開比對：30% 不能對上 30 人，5 個百分點不能對上 5%。 */
export type NumberKind = '#' | '%' | 'pt';

/** 擷取器在某位置的結果：token 為 null 表示這段被消耗但不算數字（例如排除詞）。 */
export interface Hit {
  readonly token: NumberToken | null;
  readonly end: number;
}

/** 拉丁、希臘、西里爾字母（判斷數字是否黏著字母用；不含中日文）。 */
export const LETTER = String.raw`A-Za-zÀ-ɏͰ-ϿЀ-ӿ`;

/** 接在數字後的百分比寫法。 */
export const PERCENT_SUFFIX = /\s*(?:([%‰‱])|percent\b|per\s+cent\b|pct\b)/iuy;
/** 接在數字後的百分點寫法（標記已在正規化時換好）。 */
export const POINTS_SUFFIX = /\s*(?:個|个)?\s*\uE000/uy;
/** 約數：十多位、百餘家、100+。 */
export const APPROX_SUFFIX = /\s*[餘余多來来幾几許+]/uy;
const PERCENT_OF_BEFORE = /\uE001\s*$/u;

/** 前面有「百分之」標記時回傳標記位置（回報原文要含「百分之」），否則 null。 */
export function percentOfStart(text: string, i: number): number | null {
  const m = PERCENT_OF_BEFORE.exec(text.slice(0, i));
  return m ? m.index : null;
}

/** 在 at 位置做 sticky 比對。 */
export function stickyAt(re: RegExp, text: string, at: number): RegExpExecArray | null {
  re.lastIndex = at;
  return re.exec(text);
}

/** ‰、‱ 換算成百分比的倍率。 */
export function percentScale(symbol: string | undefined): number {
  if (symbol === '‰') return 0.1;
  if (symbol === '‱') return 0.01;
  return 1;
}

function canonical(value: number): string {
  return String(Number(value.toPrecision(12)));
}

export function makeToken(raw: string, kind: NumberKind, value: number | null): NumberToken {
  const text = displayText(raw);
  if (value === null || !Number.isFinite(value)) return { text, key: null };
  return { text, key: `${kind}${canonical(value)}` };
}

export function unparseable(raw: string): NumberToken {
  return { text: displayText(raw), key: null };
}

/** 數字後綴（百分點、百分比）。回傳新的結尾、種類與倍率；都沒有時回傳 null。 */
export function percentLikeSuffix(
  text: string,
  at: number,
): { end: number; kind: NumberKind; scale: number } | null {
  const points = stickyAt(POINTS_SUFFIX, text, at);
  if (points) return { end: at + points[0].length, kind: 'pt', scale: 1 };
  const percent = stickyAt(PERCENT_SUFFIX, text, at);
  if (percent) return { end: at + percent[0].length, kind: '%', scale: percentScale(percent[1]) };
  return null;
}
