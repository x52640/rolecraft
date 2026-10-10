/**
 * 測試用 PDF：程式手寫最小 PDF 物件，不嵌入任何字型檔、不讀系統字型，沒有授權問題。
 * - makeTextPdf：英文，內建 Helvetica（由上到下每行一個字串）。
 * - makeChinesePdf：中文，Type0／CID 字型＋預定義 CMap UniCNS-UCS2-H（同 resume-import 的做法）。
 * - makeImageOnlyPdf：只有圖形、沒有文字層（模擬掃描檔）。
 */

/** 把物件依序（1 0 obj、2 0 obj…）寫成 PDF；物件內容只能是 ASCII。 */
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

function onePage(content: string, font: string[]): Uint8Array {
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...font,
  ]);
}

const escapeLiteral = (text: string): string => text.replace(/[\\()]/gu, (ch) => `\\${ch}`);

export function makeTextPdf(lines: readonly string[]): Uint8Array {
  const content = lines
    .map((line, i) => `BT /F1 11 Tf 72 ${760 - i * 18} Td (${escapeLiteral(line)}) Tj ET`)
    .join('\n');
  return onePage(content, [
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]);
}

export function makeChinesePdf(lines: readonly string[]): Uint8Array {
  const ucs2 = (text: string): string =>
    [...text].map((ch) => (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('');
  const content = lines
    .map((line, i) => `BT /F1 14 Tf 72 ${760 - i * 24} Td <${ucs2(line)}> Tj ET`)
    .join('\n');
  return onePage(content, [
    '<< /Type /Font /Subtype /Type0 /BaseFont /MingLiU /Encoding /UniCNS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MingLiU /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 0 >> /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /MingLiU /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>',
  ]);
}

export function makeImageOnlyPdf(): Uint8Array {
  const bars = Array.from({ length: 10 }, (_, i) => `50 ${780 - i * 30} 400 12 re f`).join('\n');
  return onePage(bars, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']);
}

export const ENGLISH_RESUME: readonly string[] = [
  'Name: Alice Chen',
  'Work Experience',
  '2020/01 ~ Present | Acme Inc. | Senior Engineer',
  'Built the billing pipeline for 3 regions.',
  'Skills',
  'TypeScript, React',
];

export const CHINESE_RESUME: readonly string[] = [
  '姓名：王小明',
  '工作經歷',
  '2019/03 ~ 至今 | 宏碁股份有限公司 | 資深工程師',
  '負責付款系統',
  '技能',
  'TypeScript、React',
];
