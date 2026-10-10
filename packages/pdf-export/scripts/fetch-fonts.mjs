// 下載隨附字型（Noto Sans TC 400／700＋OFL.txt）到指定資料夾並驗證 sha256。
// 授權：SIL Open Font License 1.1。字型不進 repo；安裝包建置或本機開發時執行一次。
// 用法：node packages/pdf-export/scripts/fetch-fonts.mjs --out <資料夾>
// 已存在且雜湊正確的檔案不重抓；雜湊不符就刪掉暫存檔並以非 0 結束。
/* global fetch, process, console */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { BUNDLED_FONT_FILES } from '../src/fonts/manifest.ts';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function existingOk(file, expected) {
  try {
    return sha256(await readFile(file)) === expected;
  } catch {
    return false;
  }
}

async function fetchOne(dir, entry) {
  const target = path.join(dir, entry.fileName);
  if (await existingOk(target, entry.sha256)) {
    console.log(`已存在：${entry.fileName}`);
    return;
  }
  console.log(`下載：${entry.fileName} ← ${entry.url}`);
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}：${entry.url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== entry.sha256) {
    throw new Error(
      `${entry.fileName} 雜湊不符（預期 ${entry.sha256}，實際 ${actual}）。` +
        '來源可能已改版，請重查來源並更新 src/fonts/manifest.ts。',
    );
  }
  const tmp = `${target}.part`;
  await writeFile(tmp, bytes);
  await rename(tmp, target);
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } } });
  if (!values.out) {
    console.error('用法：fetch-fonts.mjs --out <資料夾>');
    process.exit(2);
  }
  const dir = path.resolve(values.out);
  await mkdir(dir, { recursive: true });
  for (const entry of BUNDLED_FONT_FILES) {
    try {
      await fetchOne(dir, entry);
    } catch (error) {
      await rm(path.join(dir, `${entry.fileName}.part`), { force: true });
      throw error;
    }
  }
  console.log(`完成：${dir}`);
}

await main();
