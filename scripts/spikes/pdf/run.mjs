// P1-T026 spike 入口：產出各路線的樣本 PDF，並自動檢查。
//
//   node scripts/spikes/pdf/run.mjs [--out <資料夾>] [--fonts <資料夾>] [--browser <執行檔>]
//
// 預設輸出到系統暫存區 rolecraft-pdf-spike/（不進 repo）；字型缺就從官方 GitHub 下載。
// 結果：<out>/*.pdf、<out>/*.png（第 1 頁）、<out>/report.json，並在終端印摘要。
/* global console, process, performance */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import fontkit from '@pdf-lib/fontkit';

import { checkPdf } from './check.mjs';
import { ensureFonts, subsetForText } from './fonts.mjs';
import { rasterizeFirstPages } from './raster.mjs';
import { BROWSER_CANDIDATES, renderWithChromium } from './render-chromium.mjs';
import { renderWithPdfLib } from './render-pdflib.mjs';
import { buildSample, COVERAGE_PROBE, COVERAGE_PROBE_IN_FONT } from './sample.mjs';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: path.join(os.tmpdir(), 'rolecraft-pdf-spike') },
    fonts: { type: 'string' },
    browser: { type: 'string' },
  },
});
const outDir = path.resolve(args.out);
const fontDir = path.resolve(args.fonts ?? path.join(outDir, 'fonts'));
await mkdir(outDir, { recursive: true });

const log = (msg) => console.log(msg);
const fonts = await ensureFonts(fontDir, log);
const blocks = buildSample();
const probeBlocks = [{ kind: /** @type {const} */ ('para'), text: COVERAGE_PROBE }];

/** 字型本身有沒有這些字（fontkit 直接查 cmap）。擷取得回文字不代表沒有豆腐字，所以要另外查。 */
async function glyphGaps(fontFile, text) {
  const font = fontkit.create(await readFile(fontFile));
  return [...new Set([...text.replace(/\s+/gu, '')])].filter(
    (c) => !font.hasGlyphForCodePoint(/** @type {number} */ (c.codePointAt(0))),
  );
}

const results = [];
async function record(tag, route, run, sampleBlocks, fontFile) {
  const t0 = performance.now();
  const out = await run();
  const ms = Math.round(performance.now() - t0);
  const file = path.join(outDir, `${tag}.pdf`);
  await writeFile(file, out.bytes);
  const check = await checkPdf(out.bytes, sampleBlocks);
  const text = sampleBlocks.map((b) => b.text).join('');
  const row = {
    tag,
    route,
    file,
    bytes: out.bytes.length,
    totalMs: ms,
    ...(out.extra ?? {}),
    glyphGapsInFont: await glyphGaps(fontFile, text),
    ...check,
  };
  results.push(row);
  log(
    `${tag}: ${(row.bytes / 1024).toFixed(0)} KB, ${ms} ms, ${check.pages} 頁, ` +
      `段落 ${check.blocksFound}/${check.blocksTotal}, 擷取缺字 [${check.missingChars.join('')}], ` +
      `字型缺字形 [${row.glyphGapsInFont.join('')}], ` +
      `碼位錯誤 ${check.wrongChars.length} 個, 字型種類 ${JSON.stringify(check.fonts.subtypes)}`,
  );
}

const read = async (name) => new Uint8Array(await readFile(fonts[name].path));
const fp = (name) => fonts[name].path;
const OTF_R = 'NotoSansTC-Regular.otf';
const OTF_B = 'NotoSansTC-Bold.otf';
const VF = 'NotoSansTC-VF.ttf';
const TTF_R = 'NotoSansTC-Static400.ttf';
const TTF_B = 'NotoSansTC-Static700.ttf';

// 路線 A：pdf-lib＋fontkit。
const pdfLib = (regular, bold, subset, b) => async () =>
  renderWithPdfLib(b, {
    regular: await read(regular),
    bold: bold ? await read(bold) : null,
    subset,
  });
const A = [
  ['A1-pdflib-otf-subset', OTF_R, OTF_B, true, blocks],
  ['A2-pdflib-otf-full', OTF_R, OTF_B, false, blocks],
  ['A3-pdflib-vf-subset', VF, null, true, blocks],
  ['A4-pdflib-ttf-subset', TTF_R, TTF_B, true, blocks],
  ['A9-pdflib-ttf-probe', TTF_R, null, true, probeBlocks],
];
for (const [tag, regular, bold, subset, b] of A) {
  await record(tag, 'pdf-lib', pdfLib(regular, bold, subset, b), b, fp(regular));
}

// 路線 A'：先用 HarfBuzz 依實際文字裁字型，再交 pdf-lib 整檔內嵌（不用 fontkit 子集化）。
const textOf = (b) => `${b.map((x) => x.text).join('')}•`;
const hbFont = async (name, b) => subsetForText(await read(name), textOf(b));
const hbPdfLib = (b) => async () => {
  const t0 = performance.now();
  const regular = await hbFont(TTF_R, b);
  const bold = await hbFont(TTF_B, b);
  const subsetMs = Math.round(performance.now() - t0);
  const out = await renderWithPdfLib(b, { regular, bold, subset: false });
  return { ...out, extra: { subsetMs } };
};
await record('A5-pdflib-hb-subset', 'pdf-lib+harfbuzz', hbPdfLib(blocks), blocks, fp(TTF_R));
const probeOk = [{ kind: /** @type {const} */ ('para'), text: COVERAGE_PROBE_IN_FONT }];
await record('A6-pdflib-hb-probe', 'pdf-lib+harfbuzz', hbPdfLib(probeOk), probeOk, fp(TTF_R));
await record(
  'A7-pdflib-ttf-probe',
  'pdf-lib',
  pdfLib(TTF_R, null, true, probeOk),
  probeOk,
  fp(TTF_R),
);

// 路線 B：Chromium 列印。
const browser = args.browser ?? BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  log('找不到 Chromium 系瀏覽器，略過路線 B 與 PNG（可用 --browser 指定）。');
} else {
  const chromium = (tag, faces, b) => async () => {
    // faces 項目是 [字型清單檔名或檔案路徑, 字重]。
    const fontFaces = faces.map(([name, weight]) => ({ path: fonts[name]?.path ?? name, weight }));
    const r = await renderWithChromium(b, { executablePath: browser, fontFaces, outDir, tag });
    const extra = {
      browser: r.version,
      launchMs: Math.round(r.launchMs),
      pdfMs: Math.round(r.pdfMs),
      fontLoaded: r.fontLoaded,
    };
    return { bytes: r.bytes, extra };
  };
  const ttfFaces = [
    [TTF_R, '400'],
    [TTF_B, '700'],
  ];
  const B = [
    ['B1-chromium-vf', [[VF, '100 900']], blocks],
    [
      'B2-chromium-otf',
      [
        [OTF_R, '400'],
        [OTF_B, '700'],
      ],
      blocks,
    ],
    ['B3-chromium-ttf', ttfFaces, blocks],
    ['B9-chromium-ttf-probe', ttfFaces, probeBlocks],
  ];
  // B4：同 B3，但字型先用 HarfBuzz 依實際文字裁過（測康熙部首碼位問題能否因此消失）。
  const hbFaces = [];
  for (const [name, weight] of ttfFaces) {
    const file = path.join(outDir, `hb-${name}`);
    await writeFile(file, await hbFont(name, blocks));
    hbFaces.push([file, weight]);
  }
  B.push(['B4-chromium-hb-subset', hbFaces, blocks]);
  for (const [tag, faces, b] of B) {
    const first = faces[0][0];
    await record(tag, 'chromium', chromium(tag, faces, b), b, fonts[first]?.path ?? first);
  }

  const pngs = await rasterizeFirstPages(
    browser,
    outDir,
    results.map((r) => r.file),
  );
  log(`\n第 1 頁 PNG（人眼檢查字形；文字擷取抓不到字形錯誤）：\n${pngs.join('\n')}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${os.release()}`,
  fonts,
  results,
};
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
log(`\n報告：${path.join(outDir, 'report.json')}`);
