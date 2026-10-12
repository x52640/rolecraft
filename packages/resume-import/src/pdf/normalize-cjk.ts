/**
 * 把 PDF 文字層裡「長得像漢字的部首字元」換回一般漢字。
 * 有些產生器（例如 104 匯出的履歷 PDF）會用康熙部首（U+2F00–2FDF，如「⼯」）
 * 或部首補充（U+2E80–2EFF，如「⻑」）代替一般漢字（「工」「長」）；
 * 外觀相同，但比對、搜尋、段落標題都會對不上。
 * 只轉這兩個區塊與相容表意字（U+F900–FAFF），不對全文做 NFKC，避免改動全形標點與數字。
 */

/** 部首補充區塊 NFKC 不會轉；只列有明確對應繁體字的。 */
const RADICAL_SUPPLEMENT: Readonly<Record<string, string>> = {
  '⺠': '民',
  '⻄': '西',
  '⻆': '角',
  '⻑': '長',
  '⻘': '青',
  '⻝': '食',
  '⻤': '鬼',
  '⻩': '黃',
};

const LOOKALIKE = /[⺀-⻿⼀-⿟豈-﫿]/gu;

export function normalizeCjkLookalikes(text: string): string {
  return text.replace(LOOKALIKE, (ch) => RADICAL_SUPPLEMENT[ch] ?? ch.normalize('NFKC'));
}
