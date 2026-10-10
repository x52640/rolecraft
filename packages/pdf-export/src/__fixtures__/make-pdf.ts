/**
 * 測試用：用 pdf-lib 造出各種「有問題」的 PDF，讓匯出後檢查不需要 Chrome 也能測。
 * 這裡的 PDF 用標準字型 Helvetica（不內嵌），所以字型檢查一定會報 foreign_font。
 */
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';

export interface FakeText {
  readonly text: string;
  readonly x?: number;
  readonly y?: number;
}

export interface FakePage {
  readonly texts: readonly FakeText[];
  readonly links?: readonly string[];
}

export const A4: [number, number] = [595.28, 841.89];

export async function makePdf(pages: readonly FakePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage(A4);
    let y = 780;
    for (const t of spec.texts) {
      page.drawText(t.text, { x: t.x ?? 50, y: t.y ?? y, size: 11, font });
      y -= 16;
    }
    const links = (spec.links ?? []).map((url, i) =>
      doc.context.register(
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [50, 100 + i * 20, 200, 115 + i * 20],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
        }),
      ),
    );
    if (links.length > 0) page.node.set(PDFName.of('Annots'), doc.context.obj(links));
  }
  return doc.save();
}
