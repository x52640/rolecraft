/**
 * 數字擷取前的正規化（R1 檢查 3）：
 * - 去掉所有不可見字元（Default_Ignorable_Code_Point、格式字元、組合符號），讓被切開的數字合併。
 * - NFKC：全形、數學粗體數字轉成 ASCII。
 * - 羅馬數字、圈號數字、上標、分數、其他文字系統的數字：無法確定數值，先記成無法辨識。
 * - 百分點、百分之、百分百換成內部標記，避免「百」被當成乘數。
 * - 緊鄰數字的形似字母（O→0、l／I→1、З→3）換掉。
 */

/** 內部標記（私用區字元；使用者原文中的私用區字元會先清掉）。 */
export const MARK_POINTS = '\uE000'; // 百分點／percentage points
export const MARK_PERCENT_OF = '\uE001'; // 百分之
export const MARK_HUNDRED_PERCENT = '\uE002'; // 百分百

const MARK_LABEL: Readonly<Record<string, string>> = {
  [MARK_POINTS]: '百分點',
  [MARK_PERCENT_OF]: '百分之',
  [MARK_HUNDRED_PERCENT]: '百分百',
};

/** 把內部標記還原成可讀文字（回報用）。 */
export function displayText(text: string): string {
  return text.replace(/[\uE000-\uE002]/gu, (m) => MARK_LABEL[m] ?? m).trim();
}

const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Mn}\p{Me}]/gu;
const PRIVATE_USE = /\p{Co}/gu;
const NUMERIC_RUN = /\p{N}+/gu;

/** 單一數字字元能否確定換成 ASCII 數字（全形、數學字體可以；上標、圈號、羅馬數字不行）。 */
function isPlainDigit(ch: string): boolean {
  if (ch === '〇') return true;
  if (!/\p{Nd}/u.test(ch)) return false;
  return /^[0-9]$/u.test(ch.normalize('NFKC'));
}

const HOMOGLYPHS: Readonly<Record<string, string>> = {
  O: '0',
  o: '0',
  О: '0',
  о: '0',
  Ο: '0',
  ο: '0',
  l: '1',
  I: '1',
  І: '1',
  і: '1',
  Ι: '1',
  ӏ: '1',
  З: '3',
  з: '3',
  Ӡ: '3',
};

/** 形似數字的字母（給「整串都是形似字母」的判定用）。 */
export const HOMOGLYPH_CHARS = Object.keys(HOMOGLYPHS).join('');

const HOMOGLYPH_CLASS = `[${HOMOGLYPH_CHARS}]`;
const LATIN_LIKE = String.raw`A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF`;
/**
 * 緊鄰數字、且前後沒有其他字母的形似字母串（1O,OOO、l0000、3О%）。
 * 夾在一般字母中的（Go1.21、lo4j）是識別字，不換。
 */
const HOMOGLYPH_NEAR_DIGIT = new RegExp(
  `(?<![${LATIN_LIKE}])(?:(?<=\\d[,.]?)${HOMOGLYPH_CLASS}+|${HOMOGLYPH_CLASS}+(?=[,.]?\\d))(?![${LATIN_LIKE}])`,
  'gu',
);

function replaceHomoglyphs(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(HOMOGLYPH_NEAR_DIGIT, (run) =>
      [...run].map((ch) => HOMOGLYPHS[ch] ?? ch).join(''),
    );
    if (next === current) return current;
    current = next;
  }
}

export interface Normalized {
  readonly text: string;
  /** 正規化時就判定無法辨識的數字原文 */
  readonly unparseable: readonly string[];
}

export function normalizeNumbers(input: string): Normalized {
  const unparseable: string[] = [];
  const visible = input.replace(INVISIBLE, '').replace(PRIVATE_USE, ' ');
  const vetted = visible.replace(NUMERIC_RUN, (run) => {
    if ([...run].every(isPlainDigit)) return run;
    unparseable.push(run);
    return ' ';
  });
  const text = replaceHomoglyphs(
    vetted
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(/٪/gu, '%')
      .replace(/؉/gu, '‰')
      .replace(/百分[點点]/gu, MARK_POINTS)
      .replace(/百分之/gu, MARK_PERCENT_OF)
      .replace(/百分百/gu, MARK_HUNDRED_PERCENT)
      .replace(/percentage[\s-]+points?\b/giu, MARK_POINTS),
  );
  return { text, unparseable };
}

/** 段落是否實質空白：去掉不可見字元後沒有內容，也沒有被清掉的數字字元。 */
export function isBlankForNumbers(text: string): boolean {
  const { text: normalized, unparseable } = normalizeNumbers(text);
  return normalized.trim() === '' && unparseable.length === 0;
}
