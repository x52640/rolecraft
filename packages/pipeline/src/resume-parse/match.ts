/**
 * 照抄比對的細節（P1-T069；對抗驗證後加嚴）：
 * - coversLines：值（去空白、NFKC）必須是引用行依序接合的子字串、每行都用到；值以英數開頭或結尾時，
 *   原文對應位置的前後一字不可是英數（「Go」不能取自「Google」）。
 * - coversWholeLines：描述、段落內文以行為單位，每段（值以換行分段）必須等於一行或連續幾行引用行的全文
 *   （可去掉開頭的 •、-、編號），依序用完所有引用行；不能截兩行頭尾拼句。
 * - 日期：必須是年份或年月格式；「至今」類字眼要緊接在區間分隔符後、或自己獨占一欄／一行，
 *   且引用行要含數字年份。
 */
import { normalizeForMatch } from './text.ts';

const ALNUM = /[A-Za-z0-9]/u;
const SPACES = /[\s\u200B-\u200D\u2060\uFEFF]/u;

/** NFKC 後的原文（保留空白）＋去空白後每字在原文中的位置，以便檢查詞界。 */
function compacted(parts: readonly string[]) {
  const spaced = parts.map((p) => p.normalize('NFKC')).join('\n');
  let compact = '';
  const pos: number[] = [];
  const bounds: number[] = [];
  let at = 0;
  for (const part of parts.map((p) => p.normalize('NFKC'))) {
    for (const char of part) {
      if (!SPACES.test(char)) {
        for (let i = 0; i < char.length; i += 1) pos.push(at + i);
        compact += char;
      }
      at += char.length;
    }
    bounds.push(compact.length);
    at += 1; // 換行
  }
  return { spaced, compact, pos, bounds };
}

export function coversLines(value: string, parts: readonly string[]): boolean {
  const target = normalizeForMatch(value);
  if (target === '' || parts.some((p) => normalizeForMatch(p) === '')) return false;
  const { spaced, compact, pos, bounds } = compacted(parts);
  const firstEnd = bounds[0] ?? 0;
  const lastStart = bounds.length > 1 ? (bounds[bounds.length - 2] ?? 0) : 0;
  const leftWord = ALNUM.test(target[0] ?? '');
  const rightWord = ALNUM.test(target[target.length - 1] ?? '');
  for (let at = compact.indexOf(target); at !== -1; at = compact.indexOf(target, at + 1)) {
    const end = at + target.length;
    if (at >= firstEnd || end <= lastStart) continue;
    const before = spaced[(pos[at] ?? 0) - 1] ?? '';
    const after = spaced[(pos[end - 1] ?? 0) + 1] ?? '';
    if (leftWord && ALNUM.test(before)) continue;
    if (rightWord && ALNUM.test(after)) continue;
    return true;
  }
  return false;
}

const MARKER = /^\s*(?:[•·・●▪◦○■□◆◇*\-–—]+|\(?\d{1,2}[.)、]|\(\d{1,2}\))\s*/u;

function lineKey(text: string): string {
  return normalizeForMatch(text.normalize('NFKC').replace(MARKER, ''));
}

export function coversWholeLines(value: string, parts: readonly string[]): boolean {
  const segments = value
    .split('\n')
    .map(lineKey)
    .filter((s) => s !== '');
  const keys = parts.map(lineKey);
  if (segments.length === 0 || keys.some((k) => k === '')) return false;
  let next = 0;
  for (const segment of segments) {
    let joined = '';
    while (next < keys.length && joined.length < segment.length) joined += keys[next++] ?? '';
    if (joined !== segment) return false;
  }
  return next === keys.length;
}

const CURRENT_WORDS = '至今|迄今|仍在職|在職中|現職|現在|目前|present|now|current|today';
export const CURRENT = new RegExp(String.raw`^(?:${CURRENT_WORDS})$`, 'iu');
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_FORMATS = [
  String.raw`(?:19|20)\d{2}(?:[./\-年]\d{1,2}月?(?:[./\-]\d{1,2}日?)?)?年?`,
  String.raw`\d{1,2}[./\-](?:19|20)\d{2}`,
  String.raw`(?:民國)?\d{2,3}[./年]\d{1,2}月?`,
  String.raw`(?:${MONTHS})[a-z]*\.?,?(?:19|20)\d{2}`,
];
const DATE = new RegExp(String.raw`^(?:${DATE_FORMATS.join('|')})$`, 'iu');

/** 開始或結束日期的值是年份或年月格式（「100人」「3年」不算）。 */
export function isDateValue(value: string): boolean {
  return DATE.test(normalizeForMatch(value));
}

/**
 * 「至今」前面的區間起點（對抗審查 2026-10-12）：在保留空白的 NFKC 文字上找，數字 token 的邊界不會因去空白而黏住
 * （「01 2019–Present」的 2019 認得）。西元年（可帶月日）、月／西元年、英文月份＋年、民國年必須帶「民國」或「年」；
 * 純小數（98.5、3.10.12、v10.2）不算。前面不能緊接數字、小數點或英文字。
 */
const START_DATE = [
  String.raw`(?:19|20)\d{2}(?:[./\-]\d{1,2}(?:[./\-]\d{1,2})?|\s*年\s*\d{1,2}\s*月?)?\s*年?`,
  String.raw`\d{1,2}[./\-](?:19|20)\d{2}`,
  String.raw`(?:${MONTHS})[a-z]*\.?,?\s*(?:19|20)\d{2}`,
  String.raw`民國\s*\d{2,3}(?:\s*[./年]\s*\d{1,2}\s*月?)?\s*年?`,
  String.raw`\d{2,3}\s*年(?:\s*\d{1,2}\s*月)?`,
].join('|');
const RANGE = String.raw`(?:[~〜\-–—至]|to(?![A-Za-z]))`;

/**
 * 「至今」類字眼的出處：字眼前面緊接「日期起點＋區間分隔符（~ - – — 至 to）」，或字眼獨占一欄（Tab）／一行且
 * 前一欄／前一行以日期起點結尾（可帶分隔符）；「目前負責…」「I now lead…」「98.5% — 至今」都不算。
 */
export function currentWordGrounded(word: string, parts: readonly string[]): boolean {
  const key = normalizeForMatch(word).toLowerCase();
  const text = parts.map((p) => p.normalize('NFKC')).join('\n');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const start = String.raw`(?<![\d.A-Za-z])(?:${START_DATE})`;
  const afterRange = new RegExp(String.raw`${start}\s*${RANGE}\s*${escaped}(?![A-Za-z])`, 'iu');
  const ownColumn = new RegExp(
    String.raw`${start}[ ]*(?:${RANGE}[ ]*)?[\t\n]\s*${escaped}[ ]*(?=[\t\n]|$)`,
    'iu',
  );
  return afterRange.test(text) || ownColumn.test(text);
}
