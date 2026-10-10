/**
 * 測試字型子集要涵蓋的文字（scripts/make-fixture-fonts.mjs 用它裁出 __fixtures__/fonts/）。
 * 改了測試文件內容就要重跑該腳本。
 */
import { SAMPLE_DOCUMENT } from './sample-document.ts';
import { printedTexts } from '../template/text.ts';

/**
 * 康熙部首（與一般漢字共用字形）：故意放進測試字型，
 * 讓「未裁切字型時 Chrome 把小寫成⼩」的問題能在測試中重現（ADR-0005 發現 2）。
 */
export const KANGXI_RADICALS = '⼀⼈⼊⼝⼤⼩⼭⼯⼼⼿⽂⽇';

/** 可列印 ASCII 全集。 */
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join(
  '',
);

/** 其他測試用到的字。 */
export const EXTRA_TEXT = `測試頁第超出上限填充內容段落標題連結範例${ASCII}`;

export const FIXTURE_TEXT = [...printedTexts(SAMPLE_DOCUMENT), KANGXI_RADICALS, EXTRA_TEXT].join(
  ' ',
);
