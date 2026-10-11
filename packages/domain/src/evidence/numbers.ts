/**
 * 從文字擷取數字（R1 檢查 3），原則是 fail closed：
 * 任何看起來像數量的片段，能確定換算出精確值的才給可比對的 key（種類＋數值），
 * 其餘（約數、未知後綴、有歧義的分隔、形似字母、其他文字系統）一律 key=null，必須改寫或逐段確認。
 * 段落與來源用同一把尺比對，所以寫法不同但數值相同（30% ＝ 百分之三十 ＝ 三成）算相符。
 */
import { exclusionSpans, type Span } from './number-exclusions.ts';
import {
  MARK_HUNDRED_PERCENT,
  MARK_PERCENT_OF,
  MARK_POINTS,
  normalizeNumbers,
} from './number-normalize.ts';
import {
  APPROX_SUFFIX,
  LETTER,
  makeToken,
  percentLikeSuffix,
  percentOfStart,
  stickyAt,
  unparseable,
  type Hit,
  type NumberKind,
  type NumberToken,
} from './number-token.ts';
import { chineseAt, englishAt, lookalikeAt } from './number-words.ts';
import { CN_NUMERAL_CLASS, CN_UNIT_CLASS, EN_SCALES, cnUnitValue } from './numerals.ts';

export type { NumberToken } from './number-token.ts';
export { isBlankForNumbers } from './number-normalize.ts';

const CORE = /\d+(?:[.,]\d+)*(?:[eE][+-]?\d+)?/uy;
/** 10 000：空白分隔的千分位和「10 個、000」分不開。 */
const SPACE_GROUP = / \d{3}(?!\d)/uy;
const CARET = /\s*\^\s*\d+/uy;
const CN_UNITS_AFTER = new RegExp(`\\s*(${CN_UNIT_CLASS}+)`, 'uy');
/** 1萬5、3千5百：單位後又接數字，口語省略的寫法不猜。 */
const DIGIT_AFTER_UNIT = new RegExp(`(?:\\d|${CN_NUMERAL_CLASS})+`, 'uy');
const CHENG = /\s*成(\d(?!\d))?/uy;
/** 「百分之」後面接的數字開頭（阿拉伯數字、中文數字、英文字母）。 */
const NUMBER_AFTER_PERCENT_OF = new RegExp(`\\s*(?:\\d|${CN_NUMERAL_CLASS}|[a-z])`, 'iuy');
const LATIN_MULTIPLIER = /\s?(bn|mn|k|m|b|w)(?![A-Za-z0-9])/iuy;
const SCALE_WORD = /[\s-]*(dozen|hundred|thousand|million|billion|trillion)(s?)(?![A-Za-z])/iuy;
const TIMES = /\s?[x×](?![A-Za-z0-9])/iuy;
const LETTER_SUFFIX = new RegExp(`[${LETTER}][${LETTER}0-9]*`, 'uy');
/** 數字前緊貼字母（EC2、K8s、IPv6、H.264）：產品或規格名，整串字面比對。 */
const LETTERS_BEFORE = new RegExp(`[${LETTER}]+[._-]?$`, 'u');
const IDENT_REST = /[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*/uy;

const LATIN_VALUE: Readonly<Record<string, number>> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  bn: 1e9,
  mn: 1e6,
  w: 1e4,
};

/** 核心數字串 → 數值；版本號回傳字串 key；有歧義回傳 null。 */
function parseCore(core: string): number | string | null {
  if (/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(core)) {
    // 1.000：歐式千分位還是小數，分不出來
    if (/^\d{1,3}\.\d{3}$/u.test(core)) return null;
    return Number(core);
  }
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(core)) return Number(core.replaceAll(',', ''));
  if (/^\d+(?:\.\d+){2,}$/u.test(core)) {
    return /^\d{1,3}(?:\.\d{3})+$/u.test(core) ? null : `v${core}`;
  }
  return null;
}

function identifierAt(text: string, i: number): Hit | null {
  const before = LETTERS_BEFORE.exec(text.slice(0, i));
  if (!before) return null;
  const start = i - before[0].length;
  // 1920x1080 的 x 是乘號，不是識別字
  if (/^[x×][._-]?$/iu.test(before[0]) && /\d$/u.test(text.slice(0, start))) return null;
  const rest = stickyAt(IDENT_REST, text, i);
  const end = i + (rest?.[0].length ?? 1);
  const raw = text.slice(start, end);
  return { token: { text: raw, key: `id:${raw.toLowerCase()}` }, end };
}

/** 數字後的量級：中文單位、k／M／bn、英文量級詞、倍數 x。回傳新結尾與倍率；有歧義時倍率為 null。 */
function multiplierAt(text: string, at: number): { end: number; factor: number | null } {
  let end = at;
  let factor = 1;
  const cn = stickyAt(CN_UNITS_AFTER, text, end);
  if (cn) {
    end += cn[0].length;
    for (const unit of cn[1] ?? '') factor *= cnUnitValue(unit) ?? Number.NaN;
    const trailing = stickyAt(DIGIT_AFTER_UNIT, text, end);
    if (trailing) return { end: end + trailing[0].length, factor: null };
    return { end, factor };
  }
  const latin = stickyAt(LATIN_MULTIPLIER, text, end);
  if (latin) {
    const value = LATIN_VALUE[(latin[1] ?? '').toLowerCase()];
    return { end: end + latin[0].length, factor: value ?? null };
  }
  for (let word = stickyAt(SCALE_WORD, text, end); word; word = stickyAt(SCALE_WORD, text, end)) {
    end += word[0].length;
    factor *= EN_SCALES[(word[1] ?? '').toLowerCase()] ?? Number.NaN;
  }
  if (end !== at) return { end, factor };
  const times = stickyAt(TIMES, text, end);
  return { end: end + (times?.[0].length ?? 0), factor };
}

function arabicAt(text: string, i: number): Hit | null {
  if (!/\d/u.test(text[i] ?? '')) return null;
  const ident = identifierAt(text, i);
  if (ident) return ident;
  const core = stickyAt(CORE, text, i);
  if (!core) return null;
  let end = i + core[0].length;
  const parsed = parseCore(core[0]);
  if (typeof parsed === 'string') return { token: { text: core[0], key: parsed }, end };

  let value: number | null = parsed;
  const percentOf = percentOfStart(text, i);
  let kind: NumberKind = percentOf === null ? '#' : '%';
  const fail = (match: RegExpExecArray | null): boolean => {
    if (!match) return false;
    end += match[0].length;
    value = null;
    return true;
  };
  if (/^\d{1,3}$/u.test(core[0]) && fail(stickyAt(SPACE_GROUP, text, end))) {
    return { token: unparseable(text.slice(i, end)), end };
  }
  fail(stickyAt(CARET, text, end));

  const suffix = percentLikeSuffix(text, end);
  const cheng = stickyAt(CHENG, text, end);
  if (suffix) {
    kind = suffix.kind;
    end = suffix.end;
    if (value !== null) value *= suffix.scale;
  } else if (cheng) {
    kind = '%';
    end += cheng[0].length;
    if (value !== null) value = value * 10 + Number(cheng[1] ?? 0);
    // 3成五、3成55：成後面又接數字，混寫不猜
    fail(stickyAt(DIGIT_AFTER_UNIT, text, end));
  } else {
    const mult = multiplierAt(text, end);
    end = mult.end;
    value = value === null || mult.factor === null ? null : value * mult.factor;
    // 5GB、100ms、3D：未知的字母後綴
    const letters = stickyAt(LETTER_SUFFIX, text, end);
    if (letters && !/^[x×]\d/iu.test(text.slice(end, end + 2))) fail(letters);
    // 1萬%、1k percent：量級後面才接百分比
    const after = percentLikeSuffix(text, end);
    if (after) {
      kind = after.kind;
      end = after.end;
      if (value !== null) value *= after.scale;
    }
  }
  fail(stickyAt(APPROX_SUFFIX, text, end));
  return { token: makeToken(text.slice(percentOf ?? i, end), kind, value), end };
}

/** 沒有被數字吃掉的標記：百分百 → 100%；百分之後面接數字就交給數字；其餘（數個百分點）無法辨識。 */
function markerAt(text: string, i: number): Hit | null {
  const ch = text[i];
  if (ch === MARK_HUNDRED_PERCENT) return { token: makeToken(ch, '%', 100), end: i + 1 };
  if (ch === MARK_PERCENT_OF) {
    // 在完整文字上判斷（「參」要看前後文，只取下一個字元會判錯：百分之參十）
    if (stickyAt(NUMBER_AFTER_PERCENT_OF, text, i + 1)) return { token: null, end: i + 1 };
    return { token: unparseable(ch), end: i + 1 };
  }
  if (ch === MARK_POINTS) return { token: unparseable(ch), end: i + 1 };
  return null;
}

function scanAt(text: string, i: number, spans: readonly Span[]): Hit | null {
  return (
    arabicAt(text, i) ??
    chineseAt(text, i, spans) ??
    englishAt(text, i, spans) ??
    lookalikeAt(text, i) ??
    markerAt(text, i)
  );
}

export function extractNumbers(input: string): NumberToken[] {
  const { text, unparseable: rejected } = normalizeNumbers(input);
  const tokens: NumberToken[] = rejected.map((raw) => unparseable(raw));
  const spans = exclusionSpans(text);
  let i = 0;
  while (i < text.length) {
    const hit = scanAt(text, i, spans);
    if (hit === null) {
      i += 1;
      continue;
    }
    if (hit.token !== null) tokens.push(hit.token);
    i = Math.max(hit.end, i + 1);
  }
  return tokens;
}

/** 文字中所有可比對的數字 key。 */
export function numberKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const token of extractNumbers(text)) {
    if (token.key !== null) keys.add(token.key);
  }
  return keys;
}
