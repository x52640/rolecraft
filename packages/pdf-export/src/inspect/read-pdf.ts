/**
 * 用 pdfjs 讀回產出的 PDF：每頁文字（＝可選取／可複製的內容）、文字位置、連結註記。
 * 只讀本機 bytes，不連網。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfTextItem {
  readonly str: string;
  /** 左下角座標與寬高（PDF point） */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PdfPageContent {
  readonly pageNumber: number;
  /** [x0, y0, x1, y1] */
  readonly view: readonly [number, number, number, number];
  readonly items: readonly PdfTextItem[];
  /** 本頁連結註記的網址 */
  readonly linkUrls: readonly string[];
}

function pdfjsAssetDir(sub: 'cmaps' | 'standard_fonts'): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('pdfjs-dist/package.json');
  return pathToFileURL(path.join(path.dirname(pkgJson), sub) + path.sep).href;
}

interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is RawTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

function linkUrlOf(annotation: unknown): string | null {
  if (typeof annotation !== 'object' || annotation === null) return null;
  const a = annotation as { subtype?: unknown; url?: unknown; unsafeUrl?: unknown };
  if (a.subtype !== 'Link') return null;
  if (typeof a.url === 'string') return a.url;
  return typeof a.unsafeUrl === 'string' ? a.unsafeUrl : null;
}

export async function readPdf(bytes: Uint8Array): Promise<PdfPageContent[]> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: pdfjsAssetDir('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: pdfjsAssetDir('standard_fonts'),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages: PdfPageContent[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
      const content = await page.getTextContent();
      const rawItems: readonly unknown[] = content.items;
      const items: PdfTextItem[] = rawItems.filter(isTextItem).map((it) => {
        const [, , c = 0, d = 1, e = 0, f = 0] = it.transform;
        return { str: it.str, x: e, y: f, width: it.width, height: it.height || Math.hypot(c, d) };
      });
      const annotations: readonly unknown[] = await page.getAnnotations();
      const linkUrls = annotations.map(linkUrlOf).filter((u): u is string => u !== null);
      pages.push({ pageNumber, view: [x0, y0, x1, y1], items, linkUrls });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
