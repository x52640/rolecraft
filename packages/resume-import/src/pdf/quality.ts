import type { ExtractFailure, RawPage, TextRun } from '../types.ts';

/** 全份文件可見字元少於這個數，就當成沒有文字層。 */
export const MIN_TEXT_CHARS = 20;
/** 亂碼字元比例上限。 */
export const MAX_GARBLED_RATIO = 0.2;
/** 重疊或旋轉文字的字元比例上限。 */
export const MAX_DISORDER_RATIO = 0.2;

/**
 * 亂碼字元：替代字元 U+FFFD、私用區（缺 ToUnicode 時常見）、
 * 控制字元。空白已先濾掉。
 */
function isGarbled(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp === 0xfffd || (cp >= 0xe000 && cp <= 0xf8ff) || cp < 0x20 || cp === 0x7f;
}

function visibleChars(text: string): string[] {
  return [...text].filter((ch) => !/\s/u.test(ch));
}

export function countVisible(runs: readonly TextRun[]): number {
  return runs.reduce((sum, run) => sum + visibleChars(run.text).length, 0);
}

export function garbledRatio(runs: readonly TextRun[]): number {
  let total = 0;
  let bad = 0;
  for (const run of runs) {
    for (const ch of visibleChars(run.text)) {
      total += 1;
      if (isGarbled(ch)) bad += 1;
    }
  }
  return total === 0 ? 0 : bad / total;
}

/**
 * 讀取順序異常的字元數（只能傳同一頁的文字段；不同頁的座標互不相干）：
 * - 旋轉／傾斜的文字
 * - 同一條基線上互相疊在一起的文字段（重複繪製、疊字）
 */
function disorderedChars(runs: readonly TextRun[]): number {
  const bad = countVisible(runs.filter((r) => r.rotated));
  const upright = runs.filter((r) => !r.rotated).sort((p, q) => q.y - p.y || p.x - q.x);
  const flagged = new Set<TextRun>();
  for (let i = 0; i < upright.length; i += 1) {
    const a = upright[i];
    if (!a) continue;
    for (let j = i + 1; j < upright.length; j += 1) {
      const b = upright[j];
      if (!b) continue;
      if (Math.abs(a.y - b.y) > Math.max(1, a.height * 0.5)) break;
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (overlap > Math.min(a.height, b.height) * 0.5) {
        flagged.add(a);
        flagged.add(b);
      }
    }
  }
  return bad + countVisible([...flagged]);
}

/** 讀取順序異常的字元比例；逐頁計算後合計，避免把不同頁同一高度的文字當成疊字。 */
export function disorderRatio(pages: readonly RawPage[]): number {
  const total = countVisible(pages.flatMap((p) => p.runs));
  if (total === 0) return 0;
  return pages.reduce((sum, p) => sum + disorderedChars(p.runs), 0) / total;
}

/** 檢查文字層品質；有問題就回傳失敗，沒問題回傳 null。 */
export function assessQuality(pages: readonly RawPage[]): ExtractFailure | null {
  const runs = pages.flatMap((p) => p.runs);
  if (countVisible(runs) < MIN_TEXT_CHARS) {
    return {
      ok: false,
      reason: 'no_text_layer',
      message: '這份 PDF 沒有可讀的文字層（可能是掃描檔或圖片）。首版不做 OCR，請改用手動輸入。',
    };
  }
  const garbled = garbledRatio(runs);
  if (garbled > MAX_GARBLED_RATIO) {
    return {
      ok: false,
      reason: 'garbled_text',
      message: `文字層有 ${Math.round(garbled * 100)}% 是無法辨識的字元（字型缺字或編碼錯誤），結果不可靠，請手動輸入或校正。`,
    };
  }
  const disorder = disorderRatio(pages);
  if (disorder > MAX_DISORDER_RATIO) {
    return {
      ok: false,
      reason: 'reading_order_unreliable',
      message: `有 ${Math.round(disorder * 100)}% 的文字重疊或旋轉，讀取順序不可靠，請手動輸入或校正。`,
    };
  }
  return null;
}
