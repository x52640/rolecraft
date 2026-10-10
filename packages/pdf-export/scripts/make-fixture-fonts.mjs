// 從完整 Noto Sans TC 裁出測試用小字型（src/__fixtures__/fonts/），涵蓋 FIXTURE_TEXT。
// 用法：node packages/pdf-export/scripts/make-fixture-fonts.mjs --fonts <fetch-fonts 的資料夾>
// 產物是 OFL 字型的子集，與 OFL.txt 一起放在 fixture 資料夾（見該處 NOTICE.txt）。
/* global console, process */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { FIXTURE_TEXT } from '../src/__fixtures__/fixture-text.ts';
import { loadBundledFonts } from '../src/fonts/bundled.ts';
import { subsetForText } from '../src/fonts/subset.ts';

const { values } = parseArgs({ options: { fonts: { type: 'string' } } });
if (!values.fonts) {
  console.error('用法：make-fixture-fonts.mjs --fonts <字型資料夾>');
  process.exit(2);
}
const fontsDir = path.resolve(values.fonts);
const outDir = path.join(import.meta.dirname, '..', 'src', '__fixtures__', 'fonts');
await mkdir(outDir, { recursive: true });

const fonts = await loadBundledFonts(fontsDir);
const regular = await subsetForText(fonts.regular, FIXTURE_TEXT);
const bold = await subsetForText(fonts.bold, FIXTURE_TEXT);
await writeFile(path.join(outDir, 'fixture-regular.ttf'), regular);
await writeFile(path.join(outDir, 'fixture-bold.ttf'), bold);
await copyFile(path.join(fontsDir, 'OFL.txt'), path.join(outDir, 'OFL.txt'));
console.log(`regular ${regular.length} bytes、bold ${bold.length} bytes → ${outDir}`);
