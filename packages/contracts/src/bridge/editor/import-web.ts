import { z } from 'zod';

import { Id, NonEmptyText, Platform, Timestamp } from '../../entities/common.ts';
import {
  RESUME_BLOCK_FIELDS,
  RESUME_CAPTURE_MAX_BLOCKS,
  SingleLineText,
  withBlockRules,
} from '../resume-capture.ts';
import { aiDraftOf } from './import-shapes.ts';

/**
 * import.* 的網頁與手動來源（D28；resume-import「匯入工作階段」「網頁來源的 AI 整理」，W4）。
 * 網頁來源的原文是 helper 依順序配發編號（b1、b2…）的區塊清單，欄位出處是區塊編號；
 * 不把區塊轉成假的頁碼／行號。PDF 來源的形狀不變（import-shapes.ts）。
 */

/** helper 配發的區塊編號：b1～b2000。 */
export const WebBlockId = z.string().regex(/^b[1-9][0-9]{0,3}$/);
export type WebBlockId = z.infer<typeof WebBlockId>;

/** import.get 回應裡的一個區塊：擷取時的區塊＋helper 配發的編號。 */
export const ImportWebBlock = withBlockRules(
  z.strictObject({ id: WebBlockId, ...RESUME_BLOCK_FIELDS }),
);
export type ImportWebBlock = z.infer<typeof ImportWebBlock>;

/** 編號必須依順序是 b1、b2…（helper 依順序配發）。 */
const ImportWebBlocks = z
  .array(ImportWebBlock)
  .max(RESUME_CAPTURE_MAX_BLOCKS)
  .refine((blocks) => blocks.every((b, i) => b.id === `b${i + 1}`), '區塊編號必須依序');

/**
 * 網頁來源的解析結果（ImportResult 的一種）。displayName 是來源名稱（例如「網頁：104」）。
 * 不帶網址與 nameText：網址只存 helper 本機，nameText 只供本機遮蔽與預填。
 */
export const ImportWebCaptureResult = z.strictObject({
  status: z.literal('web_capture'),
  displayName: NonEmptyText,
  platform: Platform,
  capturedAt: Timestamp,
  /** 擷取時超過上限、只送了前面的完整區塊；匯入頁要持續顯示「內容不完整」 */
  truncated: z.boolean(),
  blocks: ImportWebBlocks,
});
export type ImportWebCaptureResult = z.infer<typeof ImportWebCaptureResult>;

/** 手動輸入（import.start_manual）的工作階段：沒有原文，使用者直接填表確認（D18、W14）。 */
export const ImportManualResult = z.strictObject({
  status: z.literal('manual'),
  displayName: NonEmptyText,
});
export type ImportManualResult = z.infer<typeof ImportManualResult>;

/**
 * 網頁來源 AI 草稿的一個欄位：值＋出處（第一個引用區塊的編號）。
 * containsPersonalData：還原佔位字時還原出姓名或聯絡資料（W7），畫面在該欄標示「含姓名或聯絡資料」。
 * moreBlockIds（D30，相加選填）：引用多個區塊時，第一個以外的其餘引用區塊，依送出順序；只引用一個時省略。
 */
export const ImportWebDraftField = z.strictObject({
  value: z.string(),
  blockId: WebBlockId,
  containsPersonalData: z.boolean(),
  moreBlockIds: z.array(WebBlockId).optional(),
});
export type ImportWebDraftField = z.infer<typeof ImportWebDraftField>;

/** 網頁來源的 AI 草稿：結構與 PDF 的 ImportAiDraft 相同，出處換成區塊編號。 */
export const ImportWebAiDraft = aiDraftOf(ImportWebDraftField);
export type ImportWebAiDraft = z.infer<typeof ImportWebAiDraft>;

/** AI 整理的來源種類；import.ai_status 用它分辨草稿出處（省略＝PDF，相容既有回應）。 */
export const ImportAiSource = z.enum(['pdf', 'web']);
export type ImportAiSource = z.infer<typeof ImportAiSource>;

/** import.ai_parse 選填的使用者確認姓名：個數與字數上限（只用於本機遮蔽與預填，不送模型）。 */
export const IMPORT_AI_PARSE_MAX_NAMES = 8;
export const IMPORT_AI_PARSE_NAME_MAX_CHARS = 64;

/** 使用者確認的姓名（可多個寫法，例如中文名與英文名）。 */
export const ImportAiParseNames = z
  .array(SingleLineText.max(IMPORT_AI_PARSE_NAME_MAX_CHARS))
  .min(1)
  .max(IMPORT_AI_PARSE_MAX_NAMES);

/** 最近一次網頁擷取（import.latest_capture）；查詢本身不觸發 AI 整理。 */
export const ImportLatestCapture = z.strictObject({
  importId: Id,
  platform: Platform,
  capturedAt: Timestamp,
  truncated: z.boolean(),
});
export type ImportLatestCapture = z.infer<typeof ImportLatestCapture>;
