// P1-T026 spike：取得 SIL OFL 授權的 Noto Sans TC 字型（不 commit 進 repo）。
// 字型放快取資料夾；沒有就從官方 GitHub 下載（免費、無需登入）。
/* global fetch, Buffer */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import subsetFont from 'subset-font';

const NOTO_CJK = 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/TC';
const GOOGLE_FONTS = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc';

/** 字型清單：檔名 → 下載網址。授權皆為 SIL Open Font License 1.1。 */
export const FONT_SOURCES = {
  // noto-cjk 官方「SubsetOTF」：只含繁中字集的 CFF 外框 OTF，各字重分開。
  'NotoSansTC-Regular.otf': `${NOTO_CJK}/NotoSansTC-Regular.otf`,
  'NotoSansTC-Bold.otf': `${NOTO_CJK}/NotoSansTC-Bold.otf`,
  // Google Fonts 版：TrueType 外框的可變字重字型（一檔含所有字重）。
  'NotoSansTC-VF.ttf': `${GOOGLE_FONTS}/NotoSansTC%5Bwght%5D.ttf`,
  // Google Fonts CSS API（css2?family=Noto+Sans+TC:wght@400／700）給的靜態 TrueType。
  // 網址含版本號 v40，Google 改版後可能失效；失效就重查 CSS API。
  'NotoSansTC-Static400.ttf':
    'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf',
  'NotoSansTC-Static700.ttf':
    'https://fonts.gstatic.com/s/notosanstc/v40/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz70e1_Co.ttf',
  'OFL.txt': `${GOOGLE_FONTS}/OFL.txt`,
};

/**
 * 用 HarfBuzz（hb-subset，WebAssembly，無原生編譯）把字型裁成只含 text 用到的字。
 * 實測 fontkit 內建子集化會畫錯字形；先用 HarfBuzz 裁好，再讓 pdf-lib 整檔內嵌（subset: false）。
 * 裁掉沒用到的碼位也順便修掉 Chromium 把「小」對應成康熙部首「⼩」的問題（cmap 裡不再有部首碼位）。
 * @param {Uint8Array} fontBytes
 * @param {string} text
 */
export async function subsetForText(fontBytes, text) {
  const out = await subsetFont(Buffer.from(fontBytes), text, { targetFormat: 'sfnt' });
  return new Uint8Array(out);
}

/**
 * 確保字型都在 fontDir；缺的就下載。回傳 { 檔名: { path, bytes, sha256 } }。
 * @param {string} fontDir
 * @param {(msg: string) => void} log
 */
export async function ensureFonts(fontDir, log) {
  await mkdir(fontDir, { recursive: true });
  /** @type {Record<string, { path: string, bytes: number, sha256: string }>} */
  const result = {};
  for (const [name, url] of Object.entries(FONT_SOURCES)) {
    const file = path.join(fontDir, name);
    if (!existsSync(file)) {
      log(`下載 ${name} …`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`下載失敗 ${res.status}：${url}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    const data = await readFile(file);
    result[name] = {
      path: file,
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }
  return result;
}
