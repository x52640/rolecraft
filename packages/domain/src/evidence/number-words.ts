/**
 * 中文數字、英文數字詞、形似字母串的擷取（R1 檢查 3）。
 * 預設全部算數字；只有排除表（number-exclusions.ts）裡的詞不算。
 */
import { isExcluded, type Span } from './number-exclusions.ts';
import { HOMOGLYPH_CHARS } from './number-normalize.ts';
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
} from './number-token.ts';
import {
  CN_DIGIT_CLASS,
  CN_NUMERAL_CLASS,
  CN_UNIT_CLASS,
  EN_SCALES,
  EN_WORD_PATTERN,
  cnDigitValue,
  parseChineseNumber,
  parseEnglishNumber,
} from './numerals.ts';

const CN = CN_NUMERAL_CLASS;
const CN_RUN = new RegExp(`${CN}+(?:[點点]${CN}+)?`, 'uy');
/** 數萬、幾十、上千、好幾百：前綴＋單位字開頭的數字是約數。 */
const VAGUE_PREFIX = /[數数幾几上好]$/u;
const STARTS_WITH_UNIT = new RegExp(`^${CN_UNIT_CLASS}`, 'u');
/** 中文數字緊接阿拉伯數字（三萬5000、1萬5 已由阿拉伯數字那側處理）：拆不開，整段無法辨識。 */
const ADJACENT_ARABIC = /\s*\d+(?:[.,]\d+)*/uy;
/** 三成、三成五 → 百分之三十、三十五。 */
const CHENG = new RegExp(`成(${CN_DIGIT_CLASS}(?!${CN}))?`, 'uy');

export function chineseAt(text: string, i: number, spans: readonly Span[]): Hit | null {
  const m = stickyAt(CN_RUN, text, i);
  if (!m) return null;
  const run = m[0];
  let end = i + run.length;
  if (isExcluded(spans, i, end)) return { token: null, end };

  const before = text.slice(0, i);
  const percentOf = percentOfStart(text, i);
  let kind: NumberKind = percentOf === null ? '#' : '%';
  let value = parseChineseNumber(run);
  if (VAGUE_PREFIX.test(before) && STARTS_WITH_UNIT.test(run)) value = null;
  if (/\d$/u.test(before)) value = null;

  const adjacent = stickyAt(ADJACENT_ARABIC, text, end);
  const approx = stickyAt(APPROX_SUFFIX, text, end);
  const cheng = stickyAt(CHENG, text, end);
  const suffix = percentLikeSuffix(text, end);
  if (adjacent) {
    value = null;
    end += adjacent[0].length;
  } else if (approx) {
    value = null;
    end += approx[0].length;
  } else if (cheng && value !== null && kind === '#') {
    kind = '%';
    value = value * 10 + (cheng[1] === undefined ? 0 : (cnDigitValue(cheng[1]) ?? 0));
    end += cheng[0].length;
  } else if (suffix) {
    kind = suffix.kind;
    if (value !== null) value *= suffix.scale;
    end = suffix.end;
  }
  return { token: makeToken(text.slice(percentOf ?? i, end), kind, value), end };
}

const W = EN_WORD_PATTERN;
const EN_RUN = new RegExp(
  `(?<![A-Za-z0-9])(?:(an?)[\\s-]+)?(${W}(?:[\\s-]+(?:and[\\s-]+)?${W})*)(?![A-Za-z0-9])`,
  'iuy',
);

/** 複數量級詞（thousands、hundreds、dozens、tens of）與沒有數字修飾的 dozen 都是約數。 */
function isApproximateEnglish(words: readonly string[]): boolean {
  return words.some((w, k) => {
    if (w === 'tens') return true;
    const singular = w.replace(/s$/u, '');
    if (w !== singular && singular in EN_SCALES) return true;
    return w === 'dozen' && k === 0;
  });
}

export function englishAt(text: string, i: number, spans: readonly Span[]): Hit | null {
  const m = stickyAt(EN_RUN, text, i);
  if (!m) return null;
  let end = i + m[0].length;
  if (isExcluded(spans, i + m[0].length - (m[2] ?? '').length, end)) return { token: null, end };
  const words = (m[2] ?? '')
    .toLowerCase()
    .split(/[\s-]+/u)
    .filter((w) => w !== '' && w !== 'and');
  let value = isApproximateEnglish(words) ? null : parseEnglishNumber(words);
  let kind: NumberKind = '#';
  const suffix = percentLikeSuffix(text, end);
  if (suffix) {
    kind = suffix.kind;
    if (value !== null) value *= suffix.scale;
    end = suffix.end;
  }
  return { token: makeToken(text.slice(i, end), kind, value), end };
}

/** 整串都是形似數字的字母（IOO、ЗО、XII）緊接百分比或量詞：無法辨識。 */
const LOOKALIKE = new RegExp(
  `(?<![${LETTER}0-9])[${HOMOGLYPH_CHARS}VX]+(?=\\s*(?:[%‰‱\\uE000]|percent\\b|[人名位家個个項项台次件筆笔元倍成萬万千百億亿兆]))`,
  'uy',
);

export function lookalikeAt(text: string, i: number): Hit | null {
  const m = stickyAt(LOOKALIKE, text, i);
  if (!m) return null;
  return { token: unparseable(m[0]), end: i + m[0].length };
}
