/**
 * 匯出後檢查：讀回 PDF，檢查碼位、截斷、分頁、空白頁、連結、字型。
 * 讀不回來就丟 PdfExportError（fail closed），不當成「沒有問題」。
 */
import { PdfExportError } from '../errors.ts';
import type { PdfIssue } from '../issues.ts';
import { stripWhitespace } from '../template/text.ts';

import { listPdfFonts, type PdfFontEntry } from './pdf-fonts.ts';
import { readPdf, type PdfPageContent } from './read-pdf.ts';
import { compareText } from './text-compare.ts';

export interface PdfExpectation {
  /** 原文（依版面順序串接）；會再去空白比對 */
  readonly text: string;
  /** 不該落在頁尾的標題 */
  readonly keepWithNext: readonly string[];
  /** 原文所有連結 */
  readonly hrefs: readonly string[];
  /** 允許出現在 PDF 的字型 PostScript 名稱（不含子集前綴） */
  readonly allowedFonts: readonly string[];
  readonly maxPages: number;
}

export interface PdfInspection {
  readonly pageCount: number;
  readonly fonts: readonly PdfFontEntry[];
  /** 擷取回來的全文（各頁串接、未去空白），供除錯 */
  readonly extractedText: string;
  readonly issues: readonly PdfIssue[];
}

function pageText(page: PdfPageContent): string {
  return page.items.map((i) => i.str).join('');
}

/** 座標容差（PDF point），吸收浮點誤差。 */
const EDGE_TOLERANCE = 0.5;

/**
 * 截斷有兩種：整個字落在頁外 → pdfjs 擷取時丟掉，反映在碼位比對；
 * 字的起點在頁內、字形跨過頁緣 → 仍會擷取到，要靠這裡的座標檢查（P1-T038 實測）。
 */
function outOfPageIssues(pages: readonly PdfPageContent[]): PdfIssue[] {
  return pages.flatMap((page) => {
    const [x0, y0, x1, y1] = page.view;
    return page.items
      .filter((i) => i.str.trim() !== '')
      .filter(
        (i) =>
          i.x < x0 - EDGE_TOLERANCE ||
          i.y < y0 - EDGE_TOLERANCE ||
          i.x + i.width > x1 + EDGE_TOLERANCE ||
          i.y + i.height > y1 + EDGE_TOLERANCE,
      )
      .map((i): PdfIssue => ({ code: 'text_out_of_page', page: page.pageNumber, text: i.str }));
  });
}

function normalizeHref(href: string): string {
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
}

function linkIssues(pages: readonly PdfPageContent[], hrefs: readonly string[]): PdfIssue[] {
  const expected = new Set(hrefs.map(normalizeHref));
  const actual = new Set(pages.flatMap((p) => p.linkUrls.map(normalizeHref)));
  return [
    ...[...expected]
      .filter((h) => !actual.has(h))
      .map((href): PdfIssue => ({ code: 'link_missing', href })),
    ...[...actual]
      .filter((h) => !expected.has(h))
      .map((href): PdfIssue => ({ code: 'link_unexpected', href })),
  ];
}

/** 去掉子集前綴（6 個大寫字母＋「+」）。 */
function baseFontName(name: string): string {
  return name.replace(/^[A-Z]{6}\+/u, '');
}

function fontIssues(fonts: readonly PdfFontEntry[], allowed: readonly string[]): PdfIssue[] {
  const allowedSet = new Set(allowed);
  return fonts.flatMap((f): PdfIssue[] => {
    if (!allowedSet.has(baseFontName(f.name))) return [{ code: 'foreign_font', fontName: f.name }];
    if (!f.embedded || f.subtype === 'Type3') {
      return [{ code: 'font_not_embedded', fontName: f.name, subtype: f.subtype }];
    }
    return [];
  });
}

function paginationIssues(
  pages: readonly PdfPageContent[],
  keepWithNext: readonly string[],
): PdfIssue[] {
  const headings = keepWithNext.map(stripWhitespace).filter((h) => h !== '');
  return pages.flatMap((page, index): PdfIssue[] => {
    const text = stripWhitespace(pageText(page));
    if (text === '') return [{ code: 'blank_page', page: page.pageNumber }];
    if (index === pages.length - 1) return [];
    const heading = headings.find((h) => text.endsWith(h));
    return heading === undefined
      ? []
      : [{ code: 'heading_at_page_end', page: page.pageNumber, text: heading }];
  });
}

async function readOrFail<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    throw new PdfExportError('pdf_unreadable', '產出的 PDF 無法讀回檢查。', { cause });
  }
}

export async function inspectPdf(
  bytes: Uint8Array,
  expect: PdfExpectation,
): Promise<PdfInspection> {
  const pages = await readOrFail(() => readPdf(bytes));
  const fonts = await readOrFail(() => listPdfFonts(bytes));
  const extractedText = pages.map(pageText).join('\n');
  const issues: PdfIssue[] = [];
  if (pages.length > expect.maxPages) {
    issues.push({ code: 'page_limit', pages: pages.length, max: expect.maxPages });
  }
  issues.push(...paginationIssues(pages, expect.keepWithNext));
  const mismatch = compareText(stripWhitespace(expect.text), stripWhitespace(extractedText));
  if (mismatch !== null) issues.push(mismatch);
  issues.push(...outOfPageIssues(pages));
  issues.push(...linkIssues(pages, expect.hrefs));
  issues.push(...fontIssues(fonts, expect.allowedFonts));
  return { pageCount: pages.length, fonts, extractedText, issues };
}
