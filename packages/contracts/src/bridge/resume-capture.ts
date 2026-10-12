import { z } from 'zod';

import { Platform, Timestamp } from '../entities/common.ts';
import { Ack } from './common.ts';
import { withFailure } from './operations.ts';

/**
 * submit_resume_capture：送入求職網站履歷頁擷取的區塊清單（D28；web-resume-capture.md）。
 * 頁面內容只是資料（R7）：區塊不帶編號（helper 依順序配發 b1、b2…），不帶 HTML、屬性、連結網址。
 * 上限在這裡擋：超量請求 service worker 不轉送，不會碰到橋接 1 MiB 的協定斷線（W3）。
 */

/** 區塊數上限。 */
export const RESUME_CAPTURE_MAX_BLOCKS = 2000;

/** 全部區塊文字（含標籤）UTF-8 合計上限。 */
export const RESUME_CAPTURE_MAX_TEXT_BYTES = 256 * 1024;

/** 標題、清單項的層級上限（清單超過 6 層一律記 6）。 */
export const RESUME_BLOCK_MAX_LEVEL = 6;

/** nameText 字數上限（姓名元素的文字；不算進區塊文字合計）。 */
export const RESUME_CAPTURE_NAME_TEXT_MAX_CHARS = 200;

/**
 * capturedAt 字數上限：ISO 時間的小數秒本身沒有長度限制，不設上限時超長的小數秒能讓請求超過
 * 1 MiB、讓 helper 斷線（codex review）。小數秒 9 位＋時區也只有 35 字。
 */
export const RESUME_CAPTURE_TIMESTAMP_MAX_CHARS = 40;

/** url 字數上限（只有 origin＋路徑）。 */
export const RESUME_CAPTURE_URL_MAX_CHARS = 2048;

/** 區塊種類（封閉列舉）：標題、清單項、表格列（儲存格以 Tab 連接）、標籤＋值、段落。 */
export const ResumeBlockKind = z.enum([
  'heading',
  'list_item',
  'table_row',
  'label_value',
  'paragraph',
]);
export type ResumeBlockKind = z.infer<typeof ResumeBlockKind>;

/** 有層級的種類：只有標題與清單項。 */
const LEVELED_KINDS: readonly ResumeBlockKind[] = ['heading', 'list_item'];

/** 字串的 UTF-8 位元組數（落單的代理字元以 U+FFFD 計 3 位元組，與 TextEncoder 相同）。 */
export function utf8ByteLength(text: string): number {
  let total = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    total += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return total;
}

/**
 * 只有一行、沒有控制字元（Tab 例外，表格列用它連接儲存格）。
 * 擋控制字元也讓序列化後的大小有上界：JSON 只把 `"`、`\`、Tab 跳脫成兩個字元。
 */
export function isSingleLineText(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if ((code < 0x20 && code !== 0x09) || code === 0x7f) return false;
  }
  return true;
}

/** 一行非空白文字（區塊文字、標籤、姓名）。 */
export const SingleLineText = z
  .string()
  .regex(/\S/u, '不可只有空白')
  .refine(isSingleLineText, '不可含換行或控制字元');

/** 區塊欄位（請求與 import.get 回應共用；回應另帶 helper 配發的編號）。 */
export const RESUME_BLOCK_FIELDS = {
  kind: ResumeBlockKind,
  /** 只有標題與清單項有（1–6），其他種類是 null */
  level: z.int().min(1).max(RESUME_BLOCK_MAX_LEVEL).nullable(),
  /** 只有標籤＋值有（標籤另存，不算區塊文字），其他種類是 null */
  label: SingleLineText.nullable(),
  text: SingleLineText,
  /** 同一元素因換行切出的第二個以後的區塊（W18） */
  continues: z.boolean(),
};

interface BlockLike {
  kind: ResumeBlockKind;
  level: number | null;
  label: string | null;
}

/** 種類與層級、標籤的對應；回傳不符的欄位名，符合回 null。 */
export function resumeBlockMismatch(block: BlockLike): 'level' | 'label' | null {
  if (LEVELED_KINDS.includes(block.kind) !== (block.level !== null)) return 'level';
  if ((block.kind === 'label_value') !== (block.label !== null)) return 'label';
  return null;
}

function checkBlock(block: BlockLike, ctx: z.RefinementCtx): void {
  const field = resumeBlockMismatch(block);
  if (field) ctx.addIssue({ code: 'custom', path: [field], message: '種類與層級／標籤不符' });
}

/** 請求中的一個區塊（不帶編號）。 */
export const ResumeCaptureBlock = z.strictObject(RESUME_BLOCK_FIELDS).superRefine(checkBlock);
export type ResumeCaptureBlock = z.infer<typeof ResumeCaptureBlock>;

/** 區塊陣列加上種類規則（回應用；請求另有 continues 與合計大小檢查）。 */
export function withBlockRules<T extends z.ZodType<BlockLike>>(block: T) {
  return block.superRefine(checkBlock);
}

/**
 * 瀏覽器 `location.origin + location.pathname` 的寫法：https、小寫主機（IDN 為 punycode）、選填埠號、
 * 以 / 開頭的路徑（已百分比編碼的可見 ASCII）；不得有帳密、查詢字串與 #（N4）。
 */
const ORIGIN_PATH =
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:[1-9][0-9]{0,4})?\/[\x21\x22\x24-\x3e\x40-\x5b\x5d-\x7e]*$/;

/** 只收 https 的 origin＋路徑。 */
export const ResumeCaptureUrl = z
  .url({ protocol: /^https$/ })
  .max(RESUME_CAPTURE_URL_MAX_CHARS)
  .regex(ORIGIN_PATH, '只收 https 的 origin＋路徑');

/** 區塊文字（含標籤）的 UTF-8 合計。 */
export function resumeCaptureTextBytes(blocks: readonly ResumeCaptureBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    total += utf8ByteLength(block.text) + (block.label === null ? 0 : utf8ByteLength(block.label));
  }
  return total;
}

function checkBlocks(blocks: readonly ResumeCaptureBlock[], ctx: z.RefinementCtx): void {
  blocks.forEach((block, i) => {
    if (!block.continues) return;
    const prev = i > 0 ? blocks[i - 1] : undefined;
    const same =
      prev !== undefined &&
      prev.kind === block.kind &&
      prev.level === block.level &&
      prev.label === block.label;
    if (!same) {
      ctx.addIssue({
        code: 'custom',
        path: [i, 'continues'],
        message: '續行必須接在同種類的區塊後',
      });
    }
  });
  if (resumeCaptureTextBytes(blocks) > RESUME_CAPTURE_MAX_TEXT_BYTES) {
    ctx.addIssue({ code: 'custom', path: [], message: '區塊文字超過上限' });
  }
}

export const SubmitResumeCaptureRequest = z.strictObject({
  op: z.literal('submit_resume_capture'),
  payload: z.strictObject({
    /** LinkedIn 只走手動貼上（D8），不收網頁擷取 */
    platform: Platform.exclude(['linkedin']),
    url: ResumeCaptureUrl,
    capturedAt: Timestamp.max(RESUME_CAPTURE_TIMESTAMP_MAX_CHARS),
    /** 超過上限時只送前面放得下的完整區塊並標 true */
    truncated: z.boolean(),
    /** 登記的姓名元素的文字；只給 helper 本機遮蔽與預填，不送模型（W6） */
    nameText: SingleLineText.max(RESUME_CAPTURE_NAME_TEXT_MAX_CHARS).nullable(),
    blocks: z
      .array(ResumeCaptureBlock)
      .min(1)
      .max(RESUME_CAPTURE_MAX_BLOCKS)
      .superRefine(checkBlocks),
  }),
});
export type SubmitResumeCaptureRequest = z.infer<typeof SubmitResumeCaptureRequest>;

/** 成功只回 { ok: true }。 */
export const SubmitResumeCaptureResponse = withFailure(Ack);
export type SubmitResumeCaptureResponse = z.infer<typeof SubmitResumeCaptureResponse>;
