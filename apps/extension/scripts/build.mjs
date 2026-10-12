/* global console, process */
// 打包未封裝擴充功能到 dist/unpacked/（Chrome「載入未封裝項目」選這個資料夾）。
//   npm run build -w @rolecraft/extension
// 1. service worker：ES module（MV3 service worker 用 type: module）
// 2. 編輯器頁：apps/editor 的 React 程式，由它的 buildEditor() 打包到 editor/（EDITOR_PAGE）
// 3. 每站 content script：職缺頁一支、有登記履歷頁的站另一支，各自一個 IIFE
//    （executeScript 注入的檔案不能是 module；service worker 依網址選，web-resume-capture）
// 4. 由 src/manifest.ts 產生 manifest.json
// dist/ 其他位置是 tsc -b 的輸出，互不重疊。
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { build } from 'vite';

import { buildEditor } from '../../editor/scripts/build.mjs';
import { buildManifest, EDITOR_PAGE } from '../src/index.ts';
import { siteBundles } from '../src/sites/registry.ts';

const APP = path.resolve(import.meta.dirname, '..');
const OUT = path.join(APP, 'dist', 'unpacked');

const common = { configFile: false, logLevel: 'warn', publicDir: false };

await build({
  ...common,
  root: path.join(APP, 'src'),
  base: '/',
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: false,
    rolldownOptions: {
      input: { background: path.join(APP, 'src/background/main.ts') },
      output: { entryFileNames: 'background.js' },
    },
  },
});

// 編輯器只以擴充功能頁形式提供（ADR-0003）；它只經 chrome.runtime.sendMessage 轉送橋接請求。
await buildEditor(path.join(OUT, path.dirname(EDITOR_PAGE)));

for (const bundle of siteBundles()) {
  await build({
    ...common,
    root: APP,
    build: {
      outDir: OUT,
      emptyOutDir: false,
      target: 'chrome116',
      lib: {
        entry: path.join(APP, bundle.entry),
        formats: ['iife'],
        name: bundle.name,
        fileName: () => bundle.file,
      },
    },
  });
}

await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(buildManifest(), null, 2)}\n`);
console.log(`擴充功能已打包：${path.relative(process.cwd(), OUT)}`);
