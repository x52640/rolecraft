/**
 * 從文字擷取數字（R1 檢查 3）：阿拉伯數字（含全形、千分位、小數、k／M／B）、
 * 中文數字（含大寫、簡體、阿拉伯數字＋中文單位）、英文數字詞、百分比。
 * 每個數字換算成「種類＋數值」的 key，段落與來源用同一把尺比對。
 */
import {
  CN_NUMERAL_CLASS,
  CN_UNIT_CLASS,
  EN_WORD_PATTERN,
  cnUnitValue,
  isCnDigit,
  parseChineseNumber,
  parseEnglishNumber,
} from './numerals.ts';

export interface NumberToken {
  /** 原文（正規化後） */
  readonly text: string;
  /** 比對用 key；無法解析時為 null，一律視為找不到出處 */
  readonly key: string | null;
}

/** 看起來像數字的拉丁／西里爾／希臘字母（O→0、l／I→1），只在緊鄰數字時換掉。 */
const HOMOGLYPH_ZERO = 'OoОоΟο';
const HOMOGLYPH_ONE = 'lIІі';
const HOMOGLYPH_CLASS = `[${HOMOGLYPH_ZERO}${HOMOGLYPH_ONE}]`;
const HOMOGLYPH_NEAR_DIGIT = new RegExp(
  `(?<=\\d[,.]?)${HOMOGLYPH_CLASS}|${HOMOGLYPH_CLASS}(?=[,.]?\\d)`,
  'gu',
);

function replaceHomoglyphs(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(HOMOGLYPH_NEAR_DIGIT, (ch) =>
      HOMOGLYPH_ZERO.includes(ch) ? '0' : '1',
    );
    if (next === current) return current;
    current = next;
  }
}

/** 正規化：全形轉半形（NFKC）、去掉零寬等格式字元與組合符號、數字旁的形似字母。 */
export function normalizeForNumbers(text: string): string {
  const stripped = text.normalize('NFKC').replace(/[\p{Cf}\p{Mn}\p{Me}]/gu, '');
  return replaceHomoglyphs(stripped);
}

const PERCENT_SUFFIX = String.raw`(\s*(?:%|‰|percent\b|per\s+cent\b|pct\b))?`;
const ARABIC = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?)\s*(${CN_UNIT_CLASS}*)([kmb](?![a-z]))?`;
const CHINESE = `(${CN_NUMERAL_CLASS}+(?:[點点]${CN_NUMERAL_CLASS}+)?)`;
const ENGLISH = String.raw`\b(${EN_WORD_PATTERN}(?:[\s-]+(?:and[\s-]+)?${EN_WORD_PATTERN})*)\b`;

const NUMBER_RE = new RegExp(
  `(百分之)?(?:${ARABIC}|${CHINESE}|${ENGLISH})${PERCENT_SUFFIX}`,
  'giu',
);

/** 非 ASCII 的十進位數字（NFKC 後仍存在，例如阿拉伯—印度數字）：無法解析。 */
const OTHER_DECIMAL_DIGIT = /(?![0-9])\p{Nd}+/gu;

const LATIN_SUFFIX: Readonly<Record<string, number>> = { k: 1e3, m: 1e6, b: 1e9 };

/** 單一中文單位字前後出現這些字時才算數量（數萬、上千、十人）。 */
const VAGUE_PREFIX = /[數数上近逾破約约幾几好成]$/u;
const QUANTITY_SUFFIX = /^[人名位家筆笔次件元塊块倍]/u;

function canonical(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function parseArabic(digits: string, units: string, latin: string | undefined): number {
  let value = Number(digits.replaceAll(',', ''));
  for (const unit of units) value *= cnUnitValue(unit) ?? 1;
  if (latin !== undefined) value *= LATIN_SUFFIX[latin.toLowerCase()] ?? 1;
  return value;
}

/** 中文數字片段是否該算成數字（排除「統一」「十分」這類詞）。 */
function chineseRunCounts(
  run: string,
  before: string,
  after: string,
  hasPercent: boolean,
): boolean {
  if (hasPercent) return true;
  const chars = [...run];
  if (chars.some((c) => isCnDigit(c)) && !(chars.length === 1 && (run === '一' || run === '壹'))) {
    return true;
  }
  if (chars.length >= 2) return true;
  // 單一個「一」或單一個單位字：只有搭配數量詞才算
  return VAGUE_PREFIX.test(before) || QUANTITY_SUFFIX.test(after);
}

export function extractNumbers(text: string): NumberToken[] {
  const normalized = normalizeForNumbers(text);
  const tokens: NumberToken[] = [];
  for (const m of normalized.matchAll(OTHER_DECIMAL_DIGIT)) {
    tokens.push({ text: m[0], key: null });
  }
  for (const m of normalized.matchAll(NUMBER_RE)) {
    const [whole, percentPrefix, digits, units, latin, cnRun, enRun, percentSuffix] = m;
    const suffix = percentSuffix?.trim() ?? '';
    const hasPercent = percentPrefix !== undefined || suffix !== '';
    const start = m.index;
    const before = normalized.slice(Math.max(0, start - 1), start);
    const after = normalized.slice(start + whole.length, start + whole.length + 1);

    let value: number | null;
    if (digits !== undefined) {
      value = parseArabic(digits, units ?? '', latin);
    } else if (cnRun !== undefined) {
      if (!chineseRunCounts(cnRun, before, after, hasPercent)) continue;
      value = parseChineseNumber(cnRun);
    } else if (enRun !== undefined) {
      if (enRun.toLowerCase() === 'one' && !hasPercent) continue;
      value = parseEnglishNumber(enRun);
    } else {
      continue;
    }

    if (value === null || !Number.isFinite(value)) {
      tokens.push({ text: whole, key: null });
      continue;
    }
    const kind = suffix === '‰' ? '%' : hasPercent ? '%' : '#';
    const scaled = suffix === '‰' ? value / 10 : value;
    tokens.push({ text: whole, key: `${kind}${canonical(scaled)}` });
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
