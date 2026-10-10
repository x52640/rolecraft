// 產出樣本 PDF 給擁有者人工檢查（虛構履歷，見 src/__fixtures__/sample-document.ts）。
// 用法：node packages/pdf-export/scripts/render-sample.mjs --fonts <字型資料夾> --out <輸出資料夾> [--repeat 2]
// 字型資料夾先用 fetch-fonts.mjs 準備。需要本機 Google Chrome。
/* global process, console, performance */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { SAMPLE_DOCUMENT } from '../src/__fixtures__/sample-document.ts';
import { exportResumePdf, loadBundledFonts } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    fonts: { type: 'string' },
    out: { type: 'string' },
    // 段落重複次數：2 可看兩頁分頁效果
    repeat: { type: 'string', default: '1' },
  },
});
if (!values.fonts || !values.out) {
  console.error('用法：render-sample.mjs --fonts <字型資料夾> --out <輸出資料夾> [--repeat 2]');
  process.exit(2);
}
const out = path.resolve(values.out);
await mkdir(out, { recursive: true });

const times = Number(values.repeat);
const document = {
  ...SAMPLE_DOCUMENT,
  sections: Array.from({ length: times }, () => SAMPLE_DOCUMENT.sections).flat(),
};
const name = times === 1 ? 'sample-resume' : `sample-resume-x${times}`;

const started = performance.now();
const outcome = await exportResumePdf({
  // 樣本沒有事實項，直接給「已通過」；正式流程必須由 domain 的 checkExportReadiness 產生。
  r1: { ok: true, issues: [] },
  document,
  fonts: await loadBundledFonts(path.resolve(values.fonts)),
});
const elapsedMs = Math.round(performance.now() - started);

const report = { ok: outcome.ok, elapsedMs, ...outcome.report };
await writeFile(path.join(out, `${name}.report.json`), JSON.stringify(report, null, 2));
if (outcome.ok) {
  await writeFile(path.join(out, `${name}.pdf`), outcome.pdf);
  console.log(`通過：${outcome.report.pageCount} 頁、${outcome.pdf.length} bytes、${elapsedMs} ms`);
} else {
  console.log('未通過：', JSON.stringify(outcome.report.issues, null, 2));
  process.exitCode = 1;
}
console.log(`輸出：${out}`);
