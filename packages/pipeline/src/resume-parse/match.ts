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
/** 引用行裡有與日期驗證相同格式的年份（西元、民國；codex 審查 3）。 */
const HAS_DATE = new RegExp(String.raw`(?<!\d)(?:${DATE_FORMATS.join('|')})(?!\d)`, 'iu');

/** 開始或結束日期的值是年份或年月格式（「100人」「3年」不算）。 */
export function isDateValue(value: string): boolean {
  return DATE.test(normalizeForMatch(value));
}

/**
 * 「至今」類字眼的出處：引用行要有年份（西元或民國，與日期驗證同格式），且字眼緊接在區間分隔符（~ - – — 至 to）後，
 * 或自己獨占一欄（Tab 分隔）／一行；「目前負責…」「I now lead…」都不算。
 */
export function currentWordGrounded(word: string, parts: readonly string[]): boolean {
  const key = normalizeForMatch(word).toLowerCase();
  const texts = parts.map((p) => p.normalize('NFKC'));
  if (!texts.some((t) => HAS_DATE.test(normalizeForMatch(t)))) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const afterRange = new RegExp(String.raw`(?:[~\-–—至]|\bto)\s*${escaped}(?![A-Za-z])`, 'iu');
  return texts.some(
    (t) =>
      afterRange.test(t) ||
      t.split('\t').some((segment) => normalizeForMatch(segment).toLowerCase() === key),
  );
}
