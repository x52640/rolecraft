import { createRequire } from 'node:module';
import path from 'node:path';

import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { RawPage, TextRun } from '../types.ts';

import { normalizeCjkLookalikes } from './normalize-cjk.ts';

/** 讀檔失敗的分類，交給上層轉成使用者看得懂的原因。 */
export class PdfReadError extends Error {
  readonly kind: 'invalid_pdf' | 'encrypted';
  constructor(kind: 'invalid_pdf' | 'encrypted', message: string) {
    super(message);
    this.name = 'PdfReadError';
    this.kind = kind;
  }
}

/**
 * pdfjs 隨附的 CMap 與標準字型資料夾（本機檔案，不連網）。中文 CID 字型需要 CMap。
 * Node 版 pdfjs 用 fs 讀這個位置，必須給檔案系統路徑（結尾加分隔符）；
 * 給 file:// URL 會讀不到，中文 CID 字型就抽不出字（codex 補審 3c5e934）。
 */
function pdfjsAssetDir(sub: 'cmaps' | 'standard_fonts'): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('pdfjs-dist/package.json');
  return path.join(path.dirname(pkgJson), sub) + path.sep;
}

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is PdfjsTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

function toRun(item: PdfjsTextItem): TextRun {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform;
  const scale = Math.hypot(c, d);
  return {
    text: normalizeCjkLookalikes(item.str),
    x: e,
    y: f,
    width: item.width,
    height: item.height || scale,
    rotated: Math.abs(b) > 1e-3 || Math.abs(c) > 1e-3 || a <= 0,
  };
}

function startLoading(data: Uint8Array): PDFDocumentLoadingTask {
  // pdfjs 會轉移 buffer 所有權，複製一份避免動到呼叫端的資料。
  return getDocument({
    data: new Uint8Array(data),
    cMapUrl: pdfjsAssetDir('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: pdfjsAssetDir('standard_fonts'),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
}

async function openDocument(task: PDFDocumentLoadingTask): Promise<PDFDocumentProxy> {
  try {
    return await task.promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'PasswordException') {
      throw new PdfReadError('encrypted', '這份 PDF 有密碼保護，無法讀取。');
    }
    throw new PdfReadError('invalid_pdf', '無法開啟這份 PDF，檔案可能損壞或不是 PDF。');
  }
}

/** 用 pdfjs 在本機讀出每一頁的文字層（不做 OCR，D18）。 */
export async function readTextLayer(data: Uint8Array): Promise<RawPage[]> {
  const task = startLoading(data);
  try {
    const doc = await openDocument(task);
    const pages: RawPage[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      pages.push(await readPage(doc, pageNumber));
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** 讀一頁；頁面結構壞掉時 pdfjs 丟的錯誤一律歸類為 invalid_pdf（codex 補審 3c5e934）。 */
async function readPage(doc: PDFDocumentProxy, pageNumber: number): Promise<RawPage> {
  let page;
  let items: readonly unknown[];
  try {
    page = await doc.getPage(pageNumber);
    items = (await page.getTextContent()).items;
  } catch {
    throw new PdfReadError('invalid_pdf', `無法讀取 PDF 第 ${pageNumber} 頁，檔案可能損壞。`);
  }
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
  const runs: TextRun[] = [];
  for (const item of items) {
    if (isTextItem(item) && item.str.trim() !== '') runs.push(toRun(item));
  }
  page.cleanup();
  return { pageNumber, width: x1 - x0, height: y1 - y0, runs };
}
