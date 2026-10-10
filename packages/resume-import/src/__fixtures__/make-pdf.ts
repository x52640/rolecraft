/**
 * 測試用 PDF 產生器（pdf-lib）。只用內建 Helvetica，不打包任何系統字型，所以只有英文文字。
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
