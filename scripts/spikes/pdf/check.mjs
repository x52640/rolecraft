// P1-T026 spike：自動檢查樣本 PDF。
// 1. 用 pdfjs 把文字擷取回來（＝「可選取／可複製」的代理指標），逐段比對原文。
// 2. 找缺字：原文有、擷取結果沒有的字元。
// 3. 列出 PDF 內的字型與是否內嵌（不內嵌＝換台電腦可能變字）。
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const strip = (s) => s.replace(/\s+/gu, '');

/** @param {Uint8Array} bytes */
async function extractPages(bytes) {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(''));
  }
  await task.destroy();
  return pages;
}

/**
 * 字型種類統計。Type0/CIDFont＝真正內嵌字型；Type3＝每個字形畫成向量路徑
 * （看起來一樣，但不是字型，文字對應只靠 ToUnicode）。
 * @param {Uint8Array} bytes
 */
async function listFonts(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  /** @type {Record<string, number>} */
  const subtypes = {};
  const embedded = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const type = obj.get(PDFName.of('Type'));
    if (!(type instanceof PDFName)) continue;
    if (type.asString() === '/Font') {
      const sub = String(obj.get(PDFName.of('Subtype')));
      subtypes[sub] = (subtypes[sub] ?? 0) + 1;
    } else if (type.asString() === '/FontDescriptor') {
      const name = obj.get(PDFName.of('FontName'));
      const file = ['FontFile', 'FontFile2', 'FontFile3'].find((k) => obj.has(PDFName.of(k)));
      embedded.push(`${name instanceof PDFName ? name.decodeText() : '?'}:${file ?? '未內嵌'}`);
    }
  }
  return { subtypes, embedded };
}

/**
 * @param {Uint8Array} bytes
 * @param {import('./sample.mjs').Block[]} blocks
 */
export async function checkPdf(bytes, blocks) {
  const pages = await extractPages(bytes);
  const all = strip(pages.join(''));
  const missingBlocks = blocks.filter((b) => !all.includes(strip(b.text))).map((b) => b.text);
  const extractedChars = new Set(all);
  const sourceChars = new Set(strip(blocks.map((b) => b.text).join('')));
  const missingChars = [...sourceChars].filter((c) => !extractedChars.has(c));
  // 擷取到、但原文沒有的字：通常是「看起來一樣、碼位不同」，例如 小(U+5C0F) 變成康熙部首 ⼩(U+2F29)。
  // 複製貼上或 ATS 搜尋「小」會找不到。
  const wrongChars = [...extractedChars]
    .filter((c) => !sourceChars.has(c) && c !== '•')
    .map((c) => `${c}U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`);
  return {
    pages: pages.length,
    blocksTotal: blocks.length,
    blocksFound: blocks.length - missingBlocks.length,
    missingBlocks,
    missingChars,
    wrongChars,
    pageStarts: pages.map((p) => strip(p).slice(0, 16)),
    fonts: await listFonts(bytes),
  };
}
