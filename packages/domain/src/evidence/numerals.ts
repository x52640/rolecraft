/**
 * 中文數字與英文數字詞轉數值（R1 檢查 3 用）。
 * 原則：同一個解析器同時套在段落與來源上，只要兩邊寫法換算後數值相同就算相符；
 * 寫法有歧義（三五個、十二三、萬億順序錯）一律回傳 null，由呼叫端當成無法辨識而擋下。
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

/** 萬、億、兆這類分節單位。 */
const CN_BIG_UNITS: Readonly<Record<string, number>> = {
  萬: 1e4,
  万: 1e4,
  億: 1e8,
  亿: 1e8,
  兆: 1e12,
};

/** 廿、卅、卌：二十、三十、四十。 */
const CN_TENS_SHORTHAND: Readonly<Record<string, number>> = { 廿: 20, 卅: 30, 卌: 40 };

const ALL_CN = [
  ...Object.keys(CN_DIGITS),
  ...Object.keys(CN_SMALL_UNITS),
  ...Object.keys(CN_BIG_UNITS),
  ...Object.keys(CN_TENS_SHORTHAND),
].join('');

/**
 * 「參」也是常用字（參考、參與、參加、參觀）：只有緊鄰其他數字字元、阿拉伯數字、「點」「第」，
 * 或後面接單位／量詞（參萬、參佰、參個、參年）時才算 3。其他數字字元一律算。
 */
const CAN_BE_WORD = '參';
const NUMERAL_NEIGHBOURS = `${ALL_CN}點点\\d`;
const MEASURE_WORDS =
  '個个人名位家項项台次件筆笔元塊块倍成%年月週周天日時时分秒歲岁場场套款支條条張张份頁页篇本';
const ALWAYS_CN = ALL_CN.replace(CAN_BE_WORD, '');

/** 中文數字字元（含大寫、簡體、廿卅卌）的 regex 片段（單一字元；「參」看前後文）。 */
export const CN_NUMERAL_CLASS =
  `(?:[${ALWAYS_CN}]` +
  `|(?<=[${NUMERAL_NEIGHBOURS}第])${CAN_BE_WORD}` +
  `|${CAN_BE_WORD}(?=\\s*[${NUMERAL_NEIGHBOURS}${MEASURE_WORDS}]))`;

/** 中文單位字元，接在阿拉伯數字後面時要相乘（例如 3萬、1.5億）。 */
export const CN_UNIT_CLASS = `[${Object.keys(CN_SMALL_UNITS).join('')}${Object.keys(CN_BIG_UNITS).join('')}]`;

/** 中文數字字（不含單位）。 */
export const CN_DIGIT_CLASS = `[${Object.keys(CN_DIGITS).join('')}]`;

export function isCnDigit(ch: string): boolean {
  return ch in CN_DIGITS;
}

export function cnDigitValue(ch: string): number | undefined {
  return CN_DIGITS[ch];
}

export function cnUnitValue(ch: string): number | undefined {
  return CN_SMALL_UNITS[ch] ?? CN_BIG_UNITS[ch];
}

/** 逐字寫的數字（二〇二三）：四位以上或含零才算；兩三位（三五、七八）是約數，回傳 null。 */
function parseDigitSequence(chars: readonly string[]): number | null {
  if (chars.length < 4 && !chars.some((c) => CN_DIGITS[c] === 0)) return null;
  return Number(chars.map((c) => CN_DIGITS[c]).join(''));
}

/** 中文整數（不含小數點）。無法解析或有歧義回傳 null。 */
export function parseChineseInteger(run: string): number | null {
  const chars = [...run];
  if (chars.length === 0) return null;
  if (chars.length > 1 && chars.every((c) => isCnDigit(c))) return parseDigitSequence(chars);
  let total = 0;
  let section = 0;
  let digit: number | null = null;
  let lastUnit = 0;
  let lastSmall = Infinity;
  let lastBig = Infinity;
  let zeroAfterUnit = false;
  for (const ch of chars) {
    const d = CN_DIGITS[ch];
    const small = CN_SMALL_UNITS[ch] ?? CN_TENS_SHORTHAND[ch];
    const big = CN_BIG_UNITS[ch];
    if (d !== undefined) {
      // 兩個數字字相連（十二三、三五萬）是約數
      if (digit !== null && digit !== 0) return null;
      if (d === 0) zeroAfterUnit = true;
      digit = d;
    } else if (small !== undefined) {
      if (small >= lastSmall) return null;
      const tens = CN_TENS_SHORTHAND[ch];
      if (tens !== undefined && digit !== null) return null;
      section += tens ?? (digit ?? 1) * small;
      digit = null;
      lastUnit = small;
      lastSmall = small;
      zeroAfterUnit = false;
    } else if (big !== undefined) {
      // 萬億、萬…億這類順序錯亂的寫法不猜
      if (big >= lastBig) return null;
      section += digit ?? 0;
      total += (section === 0 ? 1 : section) * big;
      section = 0;
      digit = null;
      lastUnit = big;
      lastBig = big;
      lastSmall = Infinity;
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

/** 英文量級詞；dozen 和 hundred 一樣只乘目前這節。 */
export const EN_SCALES: Readonly<Record<string, number>> = {
  dozen: 12,
  hundred: 100,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

const EN_WORDS = [...Object.keys(EN_UNITS), ...Object.keys(EN_SCALES)];

/** 英文數字詞（小寫，量級詞與 tens 可帶複數 s）regex 片段。 */
export const EN_WORD_PATTERN = `(?:${EN_WORDS.join('|')}|tens)s?`;

/** 英文數字詞序列：two hundred thousand → 200000。複數量級詞由呼叫端判成約數。 */
export function parseEnglishNumber(words: readonly string[]): number | null {
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/s$/u, '');
    const unit = EN_UNITS[raw.toLowerCase()];
    const scale = EN_SCALES[w];
    if (unit !== undefined) {
      current += unit;
    } else if (scale !== undefined && scale < 1000) {
      current = (current === 0 ? 1 : current) * scale;
    } else if (scale !== undefined) {
      total += (current === 0 ? 1 : current) * scale;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}
