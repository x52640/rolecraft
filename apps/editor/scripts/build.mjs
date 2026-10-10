/* global console, process */
// 打包編輯器頁（React）。編輯器只以擴充功能頁形式提供（ADR-0003），所以正式產物由
// apps/extension/scripts/build.mjs 呼叫 buildEditor() 輸出到 dist/unpacked/editor/。
// 直接執行本檔只是為了單獨檢查打包：node apps/editor/scripts/build.mjs → apps/editor/dist/web/
import path from 'node:path';

import { build } from 'vite';

const APP = path.resolve(import.meta.dirname, '..');

/** 把編輯器打包到 outDir（內含 index.html 與 assets/）。outDir 會被清空。 */
export async function buildEditor(outDir) {
  await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    root: APP,
    // 相對路徑：擴充功能頁位於 chrome-extension://<id>/editor/index.html
    base: './',
    build: {
      outDir,
      emptyOutDir: true,
      target: 'chrome116',
      modulePreload: false,
    },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const out = path.join(APP, 'dist', 'web');
  await buildEditor(out);
  console.log(`編輯器已打包：${path.relative(process.cwd(), out)}`);
}
