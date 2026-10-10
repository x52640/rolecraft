/**
 * 中文數字與英文數字詞轉數值（R1 檢查 3 用）。
 * 原則：同一個解析器同時套在段落與來源上，只要兩邊寫法換算後數值相同就算相符；
 * 解析不了的寫法寧可多抓（之後要逐段確認），不可漏抓。
 */

const CN_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  〇: 0,
  一: 1,
  壹: 1,
  二: 2,
  兩: 2,
  两: 2,
  貳: 2,
  贰: 2,
  三: 3,
  參: 3,
  叁: 3,
  四: 4,
  肆: 4,
  五: 5,
  伍: 5,
  六: 6,
  陸: 6,
  陆: 6,
  七: 7,
  柒: 7,
  八: 8,
  捌: 8,
  九: 9,
  玖: 9,
};

/** 十以下的小單位。 */
const CN_SMALL_UNITS: Readonly<Record<string, number>> = {
  十: 10,
  拾: 10,
  百: 100,
  佰: 100,
  千: 1000,
  仟: 1000,
};

/** 萬、億這類分節單位。 */
const CN_BIG_UNITS: Readonly<Record<string, number>> = {
  萬: 1e4,
  万: 1e4,
  億: 1e8,
  亿: 1e8,
};

/** 廿、卅：二十、三十。 */
const CN_TENS_SHORTHAND: Readonly<Record<string, number>> = { 廿: 20, 卅: 30 };

const ALL_CN = [
  ...Object.keys(CN_DIGITS),
  ...Object.keys(CN_SMALL_UNITS),
  ...Object.keys(CN_BIG_UNITS),
  ...Object.keys(CN_TENS_SHORTHAND),
].join('');

/** 中文數字字元（含大寫、簡體、廿卅），用來組 regex。 */
export const CN_NUMERAL_CLASS = `[${ALL_CN}]`;

/** 中文單位字元，接在阿拉伯數字後面時要相乘（例如 3萬、1.5億）。 */
export const CN_UNIT_CLASS = `[${Object.keys(CN_SMALL_UNITS).join('')}${Object.keys(CN_BIG_UNITS).join('')}]`;

export function isCnDigit(ch: string): boolean {
  return ch in CN_DIGITS;
}

export function cnUnitValue(ch: string): number | undefined {
  return CN_SMALL_UNITS[ch] ?? CN_BIG_UNITS[ch];
}

/** 中文整數（不含小數點）。無法解析回傳 null。 */
export function parseChineseInteger(run: string): number | null {
  const chars = [...run];
  if (chars.length === 0) return null;
  // 沒有單位、多位數字逐字寫：二〇二三 → 2023
  if (chars.length > 1 && chars.every((c) => isCnDigit(c))) {
    return Number(chars.map((c) => CN_DIGITS[c]).join(''));
  }
  let total = 0;
  let section = 0;
  let digit: number | null = null;
  let lastUnit = 0;
  let zeroAfterUnit = false;
  for (const ch of chars) {
    const d = CN_DIGITS[ch];
    const small = CN_SMALL_UNITS[ch];
    const big = CN_BIG_UNITS[ch];
    const tens = CN_TENS_SHORTHAND[ch];
    if (d !== undefined) {
      if (d === 0) zeroAfterUnit = true;
      digit = d;
    } else if (tens !== undefined) {
      section += tens;
      digit = null;
      lastUnit = 10;
      zeroAfterUnit = false;
    } else if (small !== undefined) {
      section += (digit ?? 1) * small;
      digit = null;
      lastUnit = small;
      zeroAfterUnit = false;
    } else if (big !== undefined) {
      section += digit ?? 0;
      total += (section === 0 ? 1 : section) * big;
      section = 0;
      digit = null;
      lastUnit = big;
      zeroAfterUnit = false;
    } else {
      return null;
    }
  }
  // 口語省略尾單位：一萬五 → 15000、三百五 → 350
  if (digit !== null && lastUnit >= 100 && !zeroAfterUnit) {
    section += (digit * lastUnit) / 10;
    digit = null;
  }
  return total + section + (digit ?? 0);
}

/** 中文數字，可含「點」小數：三點五 → 3.5；三點五萬 → 35000。 */
export function parseChineseNumber(run: string): number | null {
  const parts = run.split(/[點点]/u);
  if (parts.length === 1) return parseChineseInteger(run);
  if (parts.length !== 2) return null;
  const [intPart = '', rest = ''] = parts;
  const fracChars = [...rest];
  let i = 0;
  while (i < fracChars.length && isCnDigit(fracChars[i] ?? '')) i += 1;
  if (i === 0) return null;
  const fraction = Number(
    `0.${fracChars
      .slice(0, i)
      .map((c) => CN_DIGITS[c])
      .join('')}`,
  );
  const whole = intPart === '' ? 0 : parseChineseInteger(intPart);
  if (whole === null) return null;
  let value = whole + fraction;
  for (const unit of fracChars.slice(i)) {
    const mult = cnUnitValue(unit);
    if (mult === undefined) return null;
    value *= mult;
  }
  return value;
}

const EN_UNITS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const EN_SCALES: Readonly<Record<string, number>> = {
  hundred: 100,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};

/** 英文數字詞（小寫）regex 片段。 */
export const EN_WORD_PATTERN = `(?:${[...Object.keys(EN_UNITS), ...Object.keys(EN_SCALES)].join('|')})`;

/** 英文數字詞序列：two hundred thousand → 200000。 */
export function parseEnglishNumber(run: string): number | null {
  const words = run
    .toLowerCase()
    .split(/[\s-]+/u)
    .filter((w) => w !== '' && w !== 'and');
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const w of words) {
    const unit = EN_UNITS[w];
    const scale = EN_SCALES[w];
    if (unit !== undefined) {
      current += unit;
    } else if (scale === 100) {
      current = (current === 0 ? 1 : current) * 100;
    } else if (scale !== undefined) {
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}
