/// <reference types="node" />
// 真實 Chrome 測試的共用環境（只在 RUN_CHROME=1 時用；需要本機 Google Chrome，CHROME_PATH 可改路徑）。
// 用拋棄式暫存 profile（puppeteer 建）啟動 Chrome，載入只含探針 content script 的暫存擴充功能，
// 頁面由本機 127.0.0.1 的暫時伺服器提供；不碰使用者 profile、不連外。
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { SubmitResumeCaptureRequest } from '@rolecraft/contracts';
import puppeteer, { type Browser } from 'puppeteer-core';
import { build } from 'vite';

const HERE = import.meta.dirname;
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const RUN_CHROME = process.env.RUN_CHROME === '1';
export const CHROME_TIMEOUT = 120_000;

export interface ProbeRequest {
  rootSelector: string;
  nameSelector?: string | null;
  pageUrl?: string;
  useChromeDom?: boolean;
}

export type ProbeResult = SubmitResumeCaptureRequest | 'not_found' | 'invalid' | { error: string };

export interface ChromeProbe {
  browserVersion: string;
  /** 登記一個頁面（路徑 → 完整 HTML） */
  serve(pathname: string, html: string): void;
  /** 開頁（寬 1280，桌面版）→ 在擴充功能隔離環境跑一次擷取，回傳結果 */
  capture(pathname: string, request: ProbeRequest): Promise<ProbeResult>;
  close(): Promise<void>;
}

/** 探針打包成 IIFE（executeScript／content script 不能是 module），和正式打包同一個 target。 */
async function bundleProbe(): Promise<string> {
  const output = await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    root: HERE,
    build: {
      write: false,
      target: 'chrome116',
      minify: false,
      lib: {
        entry: path.join(HERE, 'probe.test-helpers.ts'),
        formats: ['iife'],
        name: 'rolecraftProbe',
        fileName: () => 'probe.js',
      },
    },
  });
  const first = Array.isArray(output) ? output[0] : output;
  const chunk = first && 'output' in first ? first.output[0] : undefined;
  if (!chunk || chunk.type !== 'chunk') throw new Error('探針打包失敗');
  return chunk.code;
}

async function writeProbeExtension(dir: string): Promise<void> {
  const manifest = {
    manifest_version: 3,
    name: 'RoleCraft probe (test only)',
    version: '0.0.0',
    content_scripts: [
      { matches: ['http://127.0.0.1/*'], js: ['probe.js'], run_at: 'document_idle' },
    ],
  };
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(dir, 'probe.js'), await bundleProbe());
}

function startServer(pages: Map<string, string>): Promise<Server> {
  const server = createServer((req, res) => {
    const html = pages.get(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    res.writeHead(html === undefined ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html ?? 'not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function launchChromeProbe(): Promise<ChromeProbe> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-probe-'));
  const pages = new Map<string, string>();
  const server = await startServer(pages);
  const port = (server.address() as AddressInfo).port;
  let browser: Browser | undefined;
  try {
    await writeProbeExtension(tmp);
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH ?? DEFAULT_CHROME,
      headless: true,
      pipe: true,
      enableExtensions: true,
      defaultViewport: { width: 1280, height: 900 },
      args: ['--no-first-run', '--no-default-browser-check', '--disable-sync'],
    });
    await browser.installExtension(tmp);
  } catch (error) {
    await browser?.close();
    server.close();
    await rm(tmp, { recursive: true, force: true });
    throw error;
  }
  const opened = browser;
  return {
    browserVersion: await opened.version(),
    serve: (pathname, html) => void pages.set(pathname, html),
    async capture(pathname, request) {
      const page = await opened.newPage();
      try {
        await page.goto(`http://127.0.0.1:${port}${pathname}`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.dataset.rolecraftProbeReady);
        const raw = await page.evaluate((req) => {
          const html = document.documentElement;
          html.dataset.rolecraftProbeRequest = JSON.stringify(req);
          document.dispatchEvent(new Event('rolecraft-probe'));
          return html.dataset.rolecraftProbeResult ?? 'null';
        }, fullRequest(request));
        return JSON.parse(raw) as ProbeResult;
      } finally {
        await page.close();
      }
    },
    async close() {
      await opened.close().catch(() => undefined);
      server.close();
      await rm(tmp, { recursive: true, force: true });
    },
  };
}

function fullRequest(request: ProbeRequest) {
  return {
    rootSelector: request.rootSelector,
    nameSelector: request.nameSelector ?? null,
    pageUrl: request.pageUrl ?? 'https://resume.example.com/view',
    useChromeDom: request.useChromeDom ?? true,
  };
}
