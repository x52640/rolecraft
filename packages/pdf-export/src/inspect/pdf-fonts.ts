/**
 * 列出 PDF 內所有字型（ADR-0005 檢查 3）：名稱、種類、是否內嵌。
 * 用 pdf-lib 走訪物件（只讀，不修改 PDF）。
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';

export interface PdfFontEntry {
  /** BaseFont，例如 AAAAAA+NotoSansTC-Regular */
  readonly name: string;
  /** Type0、TrueType、Type3… */
  readonly subtype: string;
  /** 有 FontFile／FontFile2／FontFile3 才算內嵌；Type3 沒有字型檔 */
  readonly embedded: boolean;
}

function nameOf(value: unknown): string {
  return value instanceof PDFName ? value.decodeText() : '';
}

function lookupDict(doc: PDFDocument, value: unknown): PDFDict | null {
  const resolved = value instanceof PDFRef ? doc.context.lookup(value) : value;
  return resolved instanceof PDFDict ? resolved : null;
}

function hasFontFile(descriptor: PDFDict | null): boolean {
  if (descriptor === null) return false;
  return ['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)));
}

/** Type0 的字型檔在 DescendantFonts[0].FontDescriptor；其他在自己的 FontDescriptor。 */
function isEmbedded(doc: PDFDocument, font: PDFDict): boolean {
  const descendants = font.lookup(PDFName.of('DescendantFonts'));
  if (descendants instanceof PDFArray) {
    return descendants
      .asArray()
      .every((d) =>
        hasFontFile(lookupDict(doc, lookupDict(doc, d)?.get(PDFName.of('FontDescriptor')))),
      );
  }
  return hasFontFile(lookupDict(doc, font.get(PDFName.of('FontDescriptor'))));
}

export async function listPdfFonts(bytes: Uint8Array): Promise<PdfFontEntry[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts: PdfFontEntry[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    if (nameOf(obj.get(PDFName.of('Type'))) !== 'Font') continue;
    const subtype = nameOf(obj.get(PDFName.of('Subtype')));
    // CIDFont 是 Type0 的子物件，由 Type0 一併處理。
    if (subtype === 'CIDFontType0' || subtype === 'CIDFontType2') continue;
    fonts.push({
      name: nameOf(obj.get(PDFName.of('BaseFont'))) || '(未命名)',
      subtype,
      embedded: subtype !== 'Type3' && isEmbedded(doc, obj),
    });
  }
  return fonts;
}
