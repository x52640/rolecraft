/**
 * 文字正規化（區塊抽取規則 3）：連續空白合併成一格、去掉控制字元，一行一個區塊。
 * 換行以 '\n' 在抽取過程中標記，最後才切行。
 */

/** 控制字元（含 Tab；Tab 只由表格列自己加，頁面文字裡的 Tab 當空白）。 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const SPACES = /\s+/gu;

/** 一行文字：合併空白、去頭尾空白、去控制字元。 */
export function normalizeLine(text: string): string {
  return text.replace(CONTROL, '').replace(SPACES, ' ').trim();
}

/** 依 '\n' 切行，丟掉空行。 */
export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map(normalizeLine)
    .filter((line) => line !== '');
}

/** 多行併成一行（標籤、表格儲存格、姓名用）。 */
export function joinLines(text: string): string {
  return splitLines(text).join(' ');
}
