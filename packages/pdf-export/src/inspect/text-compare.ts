/**
 * 碼位比對（ADR-0005 檢查 1）：PDF 擷取回來的文字（去空白）必須與原文（去空白）逐碼位相同。
 * 「看起來一樣」不算數：小 U+5C0F 與康熙部首 ⼩ U+2F29 畫面相同，但複製貼上、ATS 搜尋會找不到。
 */
import { formatCodePoint } from '../fonts/font-set.ts';
import type { PdfIssue } from '../issues.ts';

/** 前後各取幾個字當上下文。 */
const CONTEXT = 6;

function describe(text: string, offset: number): string {
  const chars = [...text.slice(Math.max(0, offset - CONTEXT), offset + CONTEXT + 2)];
  const at = text.codePointAt(offset);
  const focus = at === undefined ? '（結尾）' : formatCodePoint(String.fromCodePoint(at));
  return `${chars.join('')}［${focus}］`;
}

/** 回傳第一個不同之處；完全相同回傳 null。兩者都必須已去空白。 */
export function compareText(expected: string, actual: string): PdfIssue | null {
  if (expected === actual) return null;
  let i = 0;
  while (i < expected.length && i < actual.length) {
    const e = expected.codePointAt(i) ?? 0;
    const a = actual.codePointAt(i) ?? 0;
    if (e !== a) break;
    i += e > 0xffff ? 2 : 1;
  }
  return {
    code: 'text_mismatch',
    offset: i,
    expected: describe(expected, i),
    actual: describe(actual, i),
  };
}
