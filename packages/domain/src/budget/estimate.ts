/**
 * R8 保守 token 估算器（中英混合，寧可高估）。
 *
 * 這是**本機估算**，不等於任何供應商的官方計量，也不等於訂閱額度（F05）。
 * 刻意不用特定供應商的 tokenizer，避免綁定單一家。
 *
 * 高估係數（依 UTF-8 位元組長度分級，逐碼位計算）：
 * - ASCII（1 位元組）：每 {@link ASCII_CHARS_PER_TOKEN} 個字元算 1 token，總數無條件進位。
 *   英文常見約 4 字元／token，取 3 約高估 33%。
 * - 2 位元組碼位（拉丁擴充、希臘、西里爾等）：每字 1 token。
 * - 3 位元組碼位（中日韓文字、全形標點等）：每字 2 token。
 *   中文常見約 1～1.5 token／字，取 2 為高估。
 * - 4 位元組碼位（emoji、罕用字）：每字 3 token。
 *
 * 性質：估算值對字串串接「次可加」——estimate(a + b) ≤ estimate(a) + estimate(b)，
 * 且前綴的估算值不會超過整串。拆批依賴這兩個性質。
 * 不保證是嚴格上界（例如極端的數字或亂碼字串），所以呼叫端仍要有輸出與工具開銷預留。
 */

/** ASCII 每幾個字元算 1 token。 */
export const ASCII_CHARS_PER_TOKEN = 3;

/** 非 ASCII 碼位依 UTF-8 位元組長度的 token 權重。 */
export const NON_ASCII_TOKEN_WEIGHT = {
  twoByte: 1,
  threeByte: 2,
  fourByte: 3,
} as const;

/** 單一碼位的非 ASCII 權重；ASCII 回傳 0（另外累計）。 */
export function nonAsciiWeight(codePoint: number): number {
  if (codePoint < 0x80) return 0;
  if (codePoint < 0x800) return NON_ASCII_TOKEN_WEIGHT.twoByte;
  if (codePoint < 0x10000) return NON_ASCII_TOKEN_WEIGHT.threeByte;
  return NON_ASCII_TOKEN_WEIGHT.fourByte;
}

/** 逐碼位累加的估算計數器，供分段時增量計算。 */
export interface TokenTally {
  readonly asciiChars: number;
  readonly weighted: number;
}

export const EMPTY_TALLY: TokenTally = { asciiChars: 0, weighted: 0 };

export function addCodePoint(tally: TokenTally, codePoint: number): TokenTally {
  return codePoint < 0x80
    ? { asciiChars: tally.asciiChars + 1, weighted: tally.weighted }
    : { asciiChars: tally.asciiChars, weighted: tally.weighted + nonAsciiWeight(codePoint) };
}

export function tallyTokens(tally: TokenTally): number {
  return Math.ceil(tally.asciiChars / ASCII_CHARS_PER_TOKEN) + tally.weighted;
}

/** 估算一段文字的 token 數（保守，見檔頭說明）。 */
export function estimateTokens(text: string): number {
  let tally = EMPTY_TALLY;
  for (const ch of text) {
    tally = addCodePoint(tally, ch.codePointAt(0) ?? 0);
  }
  return tallyTokens(tally);
}
