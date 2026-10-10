/**
 * 測試用 PDF 產生器。pdf-lib 版只用內建 Helvetica，不打包任何系統字型，所以只有英文文字；
 * 中文用 makeCidChinesePdf（手寫 PDF 物件、不嵌入字型）。
 */
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  size?: number;
  rotate?: number;
}

const A4: [number, number] = [595, 842];

/** 每個元素是一頁；依陣列順序寫進內容串流（可故意打亂順序）。 */
export async function makePdf(pages: DrawnText[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const texts of pages) {
    const page = doc.addPage(A4);
    for (const t of texts) {
      page.drawText(t.text, {
        x: t.x,
        y: t.y,
        size: t.size ?? 11,
        font,
        ...(t.rotate ? { rotate: degrees(t.rotate) } : {}),
      });
    }
  }
  return doc.save();
}

/** 只有圖形、沒有文字層（模擬掃描檔）。 */
export async function makeImageOnlyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  for (let i = 0; i < 20; i += 1) {
    page.drawRectangle({
      x: 50,
      y: 780 - i * 30,
      width: 400,
      height: 12,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  return doc.save();
}

/** 由上往下排的單欄文字，行距 18。 */
export function column(lines: string[], x: number, top: number, size = 11): DrawnText[] {
  return lines.map((text, i) => ({ text, x, y: top - i * 18, size }));
}

export const SINGLE_COLUMN: string[] = [
  'Name: Alice Chen',
  'Email: alice@example.com',
  'Work Experience',
  '2020/01 ~ Present | Acme Inc. | Senior Engineer',
  'Built the billing pipeline for 3 regions.',
  '2017.06 - 2019.12 | Globex Corp. | Software Developer',
  'Maintained internal reporting tools.',
  'Education',
  'National Taiwan University, B.S. Computer Science',
  'Skills',
  'TypeScript, React, Node.js / SQL',
];

export const LEFT_COLUMN: string[] = [
  'Work Experience',
  '2021/03 ~ Present | Initech Ltd. | Product Manager',
  'Led a team of five.',
  '2018/07 ~ 2021/02 | Umbrella Corp. | Data Analyst',
  'Built churn dashboards.',
];

export const RIGHT_COLUMN: string[] = ['Skills', 'Python, SQL', 'Tableau', 'Languages', 'English'];

/** 把物件依序（1 0 obj、2 0 obj…）寫成最小的 PDF；物件內容只能是 ASCII。 */
function serializePdf(objects: readonly string[]): Uint8Array {
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/**
 * 含中文 CID 字型的 PDF：Type0／CIDFontType0、不嵌入字型、編碼用 Adobe 預定義 CMap
 * UniCNS-UCS2-H（繁中常見做法）。字碼要靠 pdfjs-dist 隨附的 CMap 檔（cmaps/）才能轉回文字，
 * CMap 載不到就抽不出任何字。整份檔由程式產生、不含字型檔，沒有授權問題。
 * lines：由上到下的每一行（只能放 BMP 內的字）。
 */
export function makeCidChinesePdf(lines: string[]): Uint8Array {
  const ucs2 = (text: string): string =>
    [...text].map((ch) => (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('');
  const content = lines
    .map((line, i) => `BT /F1 14 Tf 72 ${760 - i * 24} Td <${ucs2(line)}> Tj ET`)
    .join('\n');
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /MingLiU /Encoding /UniCNS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MingLiU /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 0 >> /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /MingLiU /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
  ]);
}

/** 頁面樹指向不存在的頁物件：開檔成功，讀頁時 pdfjs 丟錯。 */
export function makeBrokenPagePdf(): Uint8Array {
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [9 0 R] /Count 1 >>',
  ]);
}
