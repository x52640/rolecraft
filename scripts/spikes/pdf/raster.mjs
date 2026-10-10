// P1-T026 spike：把每份 PDF 第 1 頁畫成 PNG，給人眼檢查。
// 為什麼需要：文字擷取正確 ≠ 畫面正確。實測 pdf-lib＋CFF 字型子集化時，
// ToUnicode 對、擷取全對，但畫出來的字形是錯的（亂碼／空白）。
// 用 Chrome 內的 pdfjs 當渲染器（與 macOS 預覽程式的 Quartz 是兩套獨立實作）。
/* global window */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const pdfjsBuild = pathToFileURL(
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build'),
).href;

const PAGE = `<!doctype html><canvas id="c"></canvas><script type="module">
import * as pdfjs from '${pdfjsBuild}/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '${pdfjsBuild}/pdf.worker.mjs';
window.renderFirstPage = async (b64) => {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1.5 });
  const c = document.getElementById('c');
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
  return [vp.width, vp.height];
};
</script>`;

/**
 * @param {string} executablePath
 * @param {string} outDir
 * @param {string[]} pdfFiles
 * @returns {Promise<string[]>} 產出的 PNG 路徑
 */
export async function rasterizeFirstPages(executablePath, outDir, pdfFiles) {
  const htmlFile = path.join(outDir, '_raster.html');
  await writeFile(htmlFile, PAGE);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });
  const outputs = [];
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlFile).href);
    await page.waitForFunction('typeof window.renderFirstPage === "function"');
    for (const file of pdfFiles) {
      const b64 = (await readFile(file)).toString('base64');
      const [w, h] = await page.evaluate((b) => window.renderFirstPage(b), b64);
      await page.setViewport({ width: Math.ceil(w), height: Math.ceil(h) });
      const canvas = await page.$('#c');
      const png = file.replace(/\.pdf$/u, '.png');
      await canvas?.screenshot({ path: /** @type {`${string}.png`} */ (png) });
      outputs.push(png);
    }
  } finally {
    await browser.close();
  }
  return outputs;
}
