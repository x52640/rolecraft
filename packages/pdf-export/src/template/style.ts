/**
 * D15 中文單一模板的 CSS（A4，1–2 頁）。先求正確，視覺細節後續再調。
 * 規則：
 * - 只用隨附字型（FONT_FAMILY），不列系統字型當備援；缺字在匯出前就擋下。
 * - 不用 overflow: hidden／固定高度，避免文字被裁掉卻看不出來。
 * - 不用 ::before／::after 的 content 印字（條列點用背景畫），印出的字只有使用者內容。
 * - 不用 position（relative／absolute）：定位元素會被延後繪製，PDF 內文字順序就和原文不同，
 *   複製貼上與碼位比對都會錯（實測）。
 */

/** @font-face 用的字族名稱；故意取一個系統不會有的名字，避免瀏覽器拿到同名系統字型。 */
export const FONT_FAMILY = 'RoleCraft Noto Sans TC';

export interface FontFaceSource {
  readonly weight: 400 | 700;
  /** data: URL（字型已裁切） */
  readonly url: string;
}

export function fontFaceCss(faces: readonly FontFaceSource[]): string {
  return faces
    .map(
      (f) =>
        `@font-face { font-family: '${FONT_FAMILY}'; src: url('${f.url}') format('truetype'); ` +
        `font-weight: ${f.weight}; font-style: normal; font-display: block; }`,
    )
    .join('\n');
}

export const TEMPLATE_CSS = `
@page { size: A4; margin: 16mm 17mm; }
* { box-sizing: border-box; }
html {
  font-family: '${FONT_FAMILY}';
  font-size: 10.5pt;
  line-height: 1.5;
  color: #111;
  font-synthesis: none;
}
body { margin: 0; }
p, h1, h2, ul { margin: 0; padding: 0; }
p, li, .entry { line-break: strict; overflow-wrap: anywhere; orphans: 2; widows: 2; }
a { color: inherit; text-decoration: none; }
header { margin-bottom: 8pt; }
h1 { font-size: 20pt; font-weight: 700; line-height: 1.25; }
.headline { font-size: 11pt; margin-top: 2pt; }
.contacts { list-style: none; display: flex; flex-wrap: wrap; margin-top: 4pt; font-size: 9.5pt; }
.contacts li { padding: 0 8pt; border-left: 0.6pt solid #888; }
.contacts li:first-child { padding-left: 0; border-left: none; }
header.with-photo { display: flex; align-items: flex-start; gap: 12pt; }
.header-text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.photo { flex: none; display: block; width: 26mm; height: auto; max-height: 34mm; object-fit: contain; }
section { margin-top: 9pt; }
h2 {
  font-size: 12.5pt; font-weight: 700;
  padding-bottom: 2pt; margin-bottom: 4pt;
  border-bottom: 0.8pt solid #333;
  break-after: avoid;
}
.entry {
  display: flex; justify-content: space-between; gap: 12pt;
  margin-top: 6pt; break-after: avoid; break-inside: avoid;
}
.entry-title { font-weight: 700; }
.entry-meta { flex: none; color: #333; }
.paragraph { margin-top: 3pt; }
.bullet {
  padding-left: 11pt; margin-top: 2pt; break-inside: avoid;
  background: radial-gradient(circle closest-side, #111 80%, transparent 100%) no-repeat 2.5pt 0.6em /
    4pt 4pt;
}
.link { margin-top: 2pt; }
`;
