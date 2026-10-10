// P1-T026 spike：路線 B — HTML＋CSS 模板，交給 Chromium 的列印引擎（Page.printToPDF）。
// 用 puppeteer-core 驅動「使用者電腦上已安裝」的 Chromium 系瀏覽器，不下載 Chromium。
// 字型用 @font-face 指向隨附的 OFL 字型檔，不依賴系統字型。
/* global performance, document */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/**
 * @param {import('./sample.mjs').Block[]} blocks
 * @param {{ path: string, weight: string }[]} fontFaces
 */
export function buildHtml(blocks, fontFaces) {
  const faces = fontFaces
    .map(
      (f) =>
        `@font-face { font-family: 'RC Noto Sans TC'; src: url('${pathToFileURL(f.path).href}'); font-weight: ${f.weight}; }`,
    )
    .join('\n');
  const body = [];
  let inSection = false;
  for (const b of blocks) {
    const t = escapeHtml(b.text);
    if (b.kind === 'heading') {
      if (inSection) body.push('</section>');
      body.push(`<section><h2>${t}</h2>`);
      inSection = true;
    } else if (b.kind === 'title') body.push(`<h1>${t}</h1>`);
    else if (b.kind === 'meta') body.push(`<p class="meta">${t}</p>`);
    else if (b.kind === 'bullet') body.push(`<p class="bullet">${t}</p>`);
    else body.push(`<p>${t}</p>`);
  }
  if (inSection) body.push('</section>');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<style>
${faces}
@page { size: A4; margin: 17mm; }
html { font-family: 'RC Noto Sans TC'; font-size: 10.5pt; line-height: 1.5; color: #000; }
h1 { font-size: 20pt; margin: 0 0 6pt; }
h2 { font-size: 13pt; margin: 10pt 0 2pt; break-after: avoid; }
p { margin: 3pt 0; }
.meta { font-weight: 700; break-after: avoid; }
.bullet { padding-left: 12pt; text-indent: -8pt; break-inside: avoid; }
.bullet::before { content: '• '; }
p { orphans: 2; widows: 2; line-break: strict; }
</style></head><body>${body.join('\n')}</body></html>`;
}

/** 常見安裝位置（macOS）。D9：Chrome、Arc、Edge 都是 Chromium 系。 */
export const BROWSER_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Arc.app/Contents/MacOS/Arc',
];

/**
 * @param {import('./sample.mjs').Block[]} blocks
 * @param {{ executablePath: string, fontFaces: { path: string, weight: string }[], outDir: string, tag: string }} opts
 */
export async function renderWithChromium(blocks, opts) {
  const htmlFile = path.join(opts.outDir, `${opts.tag}.html`);
  await writeFile(htmlFile, buildHtml(blocks, opts.fontFaces));
  const t0 = performance.now();
  const browser = await puppeteer.launch({
    executablePath: opts.executablePath,
    headless: true,
    // 獨立暫存 profile：不碰使用者的瀏覽器資料。
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });
  const launchMs = performance.now() - t0;
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fontLoaded = await page.evaluate(() =>
      document.fonts.check("10pt 'RC Noto Sans TC'", '王小明'),
    );
    const t1 = performance.now();
    const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pdfMs = performance.now() - t1;
    const version = await browser.version();
    return { bytes, launchMs, pdfMs, version, fontLoaded };
  } finally {
    await browser.close();
  }
}
