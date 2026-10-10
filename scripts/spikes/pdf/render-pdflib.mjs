// P1-T026 spike：路線 A — pdf-lib＋@pdf-lib/fontkit 直接畫 PDF、內嵌字型。
// 版面（換行、分頁）全部自己算：這正是此路線的主要成本。
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

const A4 = /** @type {[number, number]} */ ([595.28, 841.89]);
const MARGIN = 48;
const STYLE = {
  title: { size: 20, bold: true, gap: 10 },
  heading: { size: 13, bold: true, gap: 6 },
  meta: { size: 10.5, bold: true, gap: 3 },
  para: { size: 10.5, bold: false, gap: 6 },
  bullet: { size: 10.5, bold: false, gap: 3 },
};
const LINE_HEIGHT = 1.5;

/** 切成可斷行的單位：連續的拉丁字母／數字當一個字，其餘一字一單位。 */
function tokenize(text) {
  return text.match(/[A-Za-z0-9@._:/\-%,+&★]+|\s+|./gu) ?? [];
}

/** 不可放行首的標點（簡化版避頭）。 */
const NO_LINE_START = new Set([...'。，、；：！？）」』》〉%．,.;:!?)']);

/**
 * 簡單斷行：寬度超過就換行；行首不放空白。
 * 避頭只做「懸掛」：行首禁用標點直接掛在上一行尾（可能超出右邊界約一字寬）。
 * 未做標點擠壓、避尾、英文連字號。
 */
function wrap(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const tok of tokenize(text)) {
    const next = line + tok;
    const overflow = font.widthOfTextAtSize(next, size) > maxWidth;
    if (line && overflow && !NO_LINE_START.has(tok)) {
      lines.push(line);
      line = /^\s+$/.test(tok) ? '' : tok;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {import('./sample.mjs').Block[]} blocks
 * @param {{ regular: Uint8Array, bold: Uint8Array | null, subset: boolean }} opts
 */
export async function renderWithPdfLib(blocks, opts) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle('RoleCraft PDF spike（pdf-lib）');
  const regular = await doc.embedFont(opts.regular, { subset: opts.subset });
  const bold = opts.bold ? await doc.embedFont(opts.bold, { subset: opts.subset }) : regular;

  const maxWidth = A4[0] - MARGIN * 2;
  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  blocks.forEach((block, i) => {
    const st = STYLE[block.kind];
    const font = st.bold ? bold : regular;
    const indent = block.kind === 'bullet' ? 12 : 0;
    const lines = wrap(block.text, font, st.size, maxWidth - indent);
    const lh = st.size * LINE_HEIGHT;
    // 標題不留在頁底：標題＋下一塊至少兩行放不下就換頁（手寫的「keep with next」）。
    const keep = block.kind === 'heading' || block.kind === 'meta' ? 2 : 0;
    const nextSize = blocks[i + 1] ? STYLE[blocks[i + 1].kind].size * LINE_HEIGHT : 0;
    if (y - lines.length * lh - keep * nextSize < MARGIN) newPage();
    y -= st.gap;
    lines.forEach((text, li) => {
      if (y - lh < MARGIN) newPage();
      y -= lh;
      if (block.kind === 'bullet' && li === 0) {
        page.drawText('•', { x: MARGIN, y, size: st.size, font: regular });
      }
      page.drawText(text, { x: MARGIN + indent, y, size: st.size, font, color: rgb(0, 0, 0) });
    });
  });

  const charset = new Set(regular.getCharacterSet());
  const bytes = await doc.save();
  return { bytes, hasGlyph: (/** @type {number} */ cp) => charset.has(cp) };
}
