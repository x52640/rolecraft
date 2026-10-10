/**
 * 用使用者電腦上已安裝的 Chrome 背景列印 HTML（ADR-0005）。
 * puppeteer-core 不下載瀏覽器；每次啟動都用 puppeteer 建的獨立暫存 profile，不碰使用者資料。
 * 頁面只允許 data: 資源，其他網路請求一律中止（縱深防禦，HTML 本身也有 CSP）。
 */
import { access, constants } from 'node:fs/promises';

import puppeteer, { type Browser } from 'puppeteer-core';

import { PdfExportError } from '../errors.ts';

/**
 * 已實測可用的瀏覽器（macOS）。Arc 用 puppeteer-core 啟動逾時、Edge 未安裝未測（ADR-0005），
 * 所以目前只列 Chrome；其他瀏覽器在驗證前一律視為尚未支援。
 */
export const SUPPORTED_BROWSERS: readonly string[] = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** 找第一個存在且可執行的已支援瀏覽器；都沒有回傳 null。 */
export async function findChrome(
  candidates: readonly string[] = SUPPORTED_BROWSERS,
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 試下一個
    }
  }
  return null;
}

export interface PrintOptions {
  readonly executablePath: string;
  /** 整個列印（含啟動）逾時毫秒數 */
  readonly timeoutMs?: number;
}

export interface PrintResult {
  readonly pdf: Uint8Array;
  readonly browserVersion: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function printWith(browser: Browser, html: string, timeoutMs: number): Promise<Uint8Array> {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('data:')) void request.continue();
    else void request.abort('blockedbyclient');
  });
  await page.setContent(html, { waitUntil: 'load' });
  // 等字型載入完（字串運算式：本套件不載入 DOM 型別）。
  await page.waitForFunction("document.fonts.status === 'loaded'");
  const pdf = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    tagged: true,
    outline: false,
  });
  return new Uint8Array(pdf);
}

/** 列印成 PDF bytes。啟動或列印失敗丟 PdfExportError('browser_failed')。 */
export async function printHtmlToPdf(html: string, options: PrintOptions): Promise<PrintResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      executablePath: options.executablePath,
      headless: true,
      timeout: timeoutMs,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-sync'],
    });
  } catch (cause) {
    throw new PdfExportError('browser_failed', 'Chrome 無法在背景啟動。', { cause });
  }
  try {
    const browserVersion = await browser.version();
    const pdf = await printWith(browser, html, timeoutMs);
    return { pdf, browserVersion };
  } catch (cause) {
    throw new PdfExportError('browser_failed', 'Chrome 列印 PDF 失敗。', { cause });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
