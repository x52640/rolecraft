import { describe, expect, it } from 'vitest';

import { A4, makePdf } from '../__fixtures__/make-pdf.ts';
import type { PdfIssue } from '../issues.ts';

import { inspectPdf, type PdfExpectation } from './inspect.ts';
import { compareText } from './text-compare.ts';

describe('compareText（碼位比對）', () => {
  it('完全相同回傳 null', () => {
    expect(compareText('林小堃𠮷', '林小堃𠮷')).toBeNull();
  });

  it('康熙部首：畫面一樣但碼位不同，要擋', () => {
    const issue = compareText('王小明一人', '王⼩明一人');
    expect(issue).toMatchObject({ code: 'text_mismatch', offset: 1 });
    expect(issue).toHaveProperty('expected', expect.stringContaining('U+5C0F'));
    expect(issue).toHaveProperty('actual', expect.stringContaining('U+2F29'));
  });

  it('擷取結果較短（文字被截斷）', () => {
    expect(compareText('一二三四', '一二')).toMatchObject({
      code: 'text_mismatch',
      offset: 2,
      actual: expect.stringContaining('（結尾）') as string,
    });
  });

  it('BMP 外字元以完整碼位比較', () => {
    expect(compareText('a𠮷b', 'a𠮷c')).toMatchObject({ offset: 3 });
  });
});

const ALLOW_HELVETICA: PdfExpectation = {
  text: '',
  keepWithNext: [],
  hrefs: [],
  allowedFonts: ['Helvetica'],
  maxPages: 2,
};

function codes(issues: readonly PdfIssue[]): string[] {
  return issues.map((i) => i.code);
}

describe('inspectPdf（匯出後檢查，以 pdf-lib 造 PDF）', () => {
  it('內容、頁數、連結都正確時沒有問題（Helvetica 未內嵌仍會報）', async () => {
    const pdf = await makePdf([
      { texts: [{ text: 'Hello' }, { text: 'World' }], links: ['https://example.com'] },
    ]);
    const result = await inspectPdf(pdf, {
      ...ALLOW_HELVETICA,
      text: 'Hello World',
      hrefs: ['https://example.com/'],
    });
    expect(result.pageCount).toBe(1);
    expect(codes(result.issues)).toEqual(['font_not_embedded']);
  });

  it('不在允許清單的字型就是系統字型補字', async () => {
    const pdf = await makePdf([{ texts: [{ text: 'Hi' }] }]);
    const result = await inspectPdf(pdf, { ...ALLOW_HELVETICA, text: 'Hi', allowedFonts: ['X'] });
    expect(result.issues).toContainEqual({ code: 'foreign_font', fontName: 'Helvetica' });
  });

  it('超過頁數上限、空白頁', async () => {
    const pdf = await makePdf([
      { texts: [{ text: 'A' }] },
      { texts: [] },
      { texts: [{ text: 'B' }] },
    ]);
    const result = await inspectPdf(pdf, { ...ALLOW_HELVETICA, text: 'AB' });
    expect(result.issues).toContainEqual({ code: 'page_limit', pages: 3, max: 2 });
    expect(result.issues).toContainEqual({ code: 'blank_page', page: 2 });
  });

  it('文字被截掉（原文有、PDF 沒有）', async () => {
    const pdf = await makePdf([{ texts: [{ text: 'Hello' }] }]);
    const result = await inspectPdf(pdf, { ...ALLOW_HELVETICA, text: 'Hello World' });
    expect(codes(result.issues)).toContain('text_mismatch');
  });

  it('文字畫出頁面右緣（被裁掉）也會反映在碼位比對', async () => {
    const pdf = await makePdf([{ texts: [{ text: 'Overflowing text', x: A4[0] - 60 }] }]);
    const result = await inspectPdf(pdf, { ...ALLOW_HELVETICA, text: 'Overflowing text' });
    expect(codes(result.issues)).toContain('text_mismatch');
  });

  it('缺少連結與多出連結', async () => {
    const pdf = await makePdf([{ texts: [{ text: 'X' }], links: ['https://evil.example/'] }]);
    const result = await inspectPdf(pdf, {
      ...ALLOW_HELVETICA,
      text: 'X',
      hrefs: ['https://github.com/a'],
    });
    expect(result.issues).toContainEqual({ code: 'link_missing', href: 'https://github.com/a' });
    expect(result.issues).toContainEqual({
      code: 'link_unexpected',
      href: 'https://evil.example/',
    });
  });

  it('標題落在頁尾時警告', async () => {
    const pdf = await makePdf([
      { texts: [{ text: 'Intro' }, { text: 'Work' }] },
      { texts: [{ text: 'Did things' }] },
    ]);
    const result = await inspectPdf(pdf, {
      ...ALLOW_HELVETICA,
      text: 'Intro Work Did things',
      keepWithNext: ['Work'],
    });
    expect(result.issues).toContainEqual({ code: 'heading_at_page_end', page: 1, text: 'Work' });
  });

  it('讀不回來就丟錯（fail closed）', async () => {
    await expect(inspectPdf(new Uint8Array([1, 2, 3]), ALLOW_HELVETICA)).rejects.toMatchObject({
      code: 'pdf_unreadable',
    });
  });
});
