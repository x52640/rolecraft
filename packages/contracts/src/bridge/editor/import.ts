import { z } from 'zod';

import { Id, NonEmptyText } from '../../entities/common.ts';
import { Profile } from '../../entities/profile.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * import.*：履歷 PDF 匯入與校正（F02、R10、D18；P1-T020）。
 * 檔案只能由 helper 開系統選取器選（R7、ADR-0003）：請求不帶任何路徑，回傳不透明 importId 與顯示名稱。
 */

/** 擷取失敗原因（對應 @rolecraft/resume-import ExtractFailureReason）。 */
export const ResumeImportFailureReason = z.enum([
  'invalid_pdf', // 不是 PDF 或檔案損壞
  'encrypted', // 有密碼保護
  'no_text_layer', // 沒有文字層（D18：手動輸入）
  'garbled_text', // 亂碼比例過高
  'reading_order_unreliable', // 讀取順序異常
]);
export type ResumeImportFailureReason = z.infer<typeof ResumeImportFailureReason>;

/** 一個待校正欄位：值＋出處（頁碼、該頁第幾行）。一律未確認。 */
export const ImportDraftField = z.strictObject({
  value: z.string(),
  pageNumber: z.int().min(1),
  lineIndex: z.int().min(0),
});
export type ImportDraftField = z.infer<typeof ImportDraftField>;

/** 結構化草稿裡的一段經歷（P1-T066）。找不到的欄位為 null；current＝仍在職（此時 endDate 為 null）。 */
export const ImportStructuredExperience = z.strictObject({
  company: ImportDraftField.nullable(),
  title: ImportDraftField.nullable(),
  startDate: ImportDraftField.nullable(),
  endDate: ImportDraftField.nullable(),
  current: z.boolean(),
  description: ImportDraftField.nullable(),
});
export type ImportStructuredExperience = z.infer<typeof ImportStructuredExperience>;

/**
 * 認出特定版面（目前只有 104）時的結構化草稿（P1-T066、ADR-0006 #14）。
 * personalInfo 保留原標籤（含「姓名」「學歷」）；每個值都帶出處。
 */
export const ImportStructuredDraft = z.strictObject({
  layout: z.literal('104'),
  personalInfo: z.array(z.strictObject({ label: z.string().min(1), value: ImportDraftField })),
  experiences: z.array(ImportStructuredExperience),
  skills: z.array(ImportDraftField),
});
export type ImportStructuredDraft = z.infer<typeof ImportStructuredDraft>;

/** 欄位草稿；找不到的欄位留空，不捏造。structured 只在認出特定版面時才有（相加欄位）。 */
export const ImportDraft = z.strictObject({
  name: ImportDraftField.nullable(),
  dates: z.array(ImportDraftField),
  companies: z.array(ImportDraftField),
  titles: z.array(ImportDraftField),
  experiences: z.array(ImportDraftField),
  skills: z.array(ImportDraftField),
  structured: ImportStructuredDraft.optional(),
});
export type ImportDraft = z.infer<typeof ImportDraft>;

/** 解析結果：成功時有原文（依閱讀順序的行）與欄位草稿；失敗時只有原因，不當成成功。 */
export const ImportResult = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('parsed'),
    displayName: NonEmptyText,
    pages: z.array(z.strictObject({ pageNumber: z.int().min(1), lines: z.array(z.string()) })),
    pagesWithoutText: z.array(z.int().min(1)),
    draft: ImportDraft,
  }),
  z.strictObject({
    status: z.literal('failed'),
    displayName: NonEmptyText,
    reason: ResumeImportFailureReason,
  }),
]);
export type ImportResult = z.infer<typeof ImportResult>;

/**
 * AI 整理（P1-T069）丟棄某個欄位的原因：
 * - unknown_line：引用的行號不存在，或是本機已移除（聯絡資料）的行
 * - lines_not_consecutive：非描述欄位引用的行不連續
 * - not_in_source：值去除空白與全半形差異後，不是引用行（依序接合）的子字串
 * - not_a_date：日期欄位的值看起來不是日期（也不是「至今」類字眼）
 * - empty：值是空白
 */
export const ImportAiDiscardReason = z.enum([
  'unknown_line',
  'lines_not_consecutive',
  'not_in_source',
  'not_a_date',
  'empty',
]);
export type ImportAiDiscardReason = z.infer<typeof ImportAiDiscardReason>;

/** 一個被丟棄的欄位：哪個欄位（給人看的位置，例如「第 2 段經歷職稱」）＋原因。不帶 AI 給的值。 */
export const ImportAiDiscard = z.strictObject({
  field: z.string().min(1),
  reason: ImportAiDiscardReason,
});
export type ImportAiDiscard = z.infer<typeof ImportAiDiscard>;

/**
 * AI 整理後、逐欄照抄檢查通過的草稿（P1-T069）。每個值都能在其出處行找到（出處＝第一個引用行）。
 * personalInfo 是本機抽出的姓名與聯絡資料（從未送給模型）；otherSections 是求職條件、自傳等段落
 * （標題原樣保留，不寫入 Profile，只給使用者參考）。
 */
export const ImportAiDraft = z.strictObject({
  personalInfo: z.array(z.strictObject({ label: z.string().min(1), value: ImportDraftField })),
  education: z.array(ImportDraftField),
  experiences: z.array(ImportStructuredExperience),
  skills: z.array(ImportDraftField),
  otherSections: z.array(z.strictObject({ heading: ImportDraftField, body: ImportDraftField })),
  discarded: z.array(ImportAiDiscard),
});
export type ImportAiDraft = z.infer<typeof ImportAiDraft>;

/** AI 整理失敗原因：輸出格式不符（不自動重試）、R6 不通過、服務錯誤、額度用完、取消。 */
export const ImportAiFailure = z.enum([
  'invalid_output',
  'run_check_failed',
  'provider_error',
  'quota_exhausted',
  'cancelled',
]);
export type ImportAiFailure = z.infer<typeof ImportAiFailure>;

/** 最近一次 AI 整理（只存在 helper 記憶體）。成功才有 draft，失敗才有 failure。 */
export const ImportAiParseView = z
  .strictObject({
    state: z.enum(['running', 'succeeded', 'failed']),
    failure: ImportAiFailure.nullable(),
    draft: ImportAiDraft.nullable(),
  })
  .refine((v) => (v.state === 'failed') === (v.failure !== null), {
    path: ['failure'],
    message: '只有失敗有原因',
  })
  .refine((v) => (v.state === 'succeeded') === (v.draft !== null), {
    path: ['draft'],
    message: '只有成功有草稿',
  });
export type ImportAiParseView = z.infer<typeof ImportAiParseView>;

/** 使用者校正後的個人資料（Profile 去掉 id 與確認旗標；確認旗標只由 import.confirm 設定）。 */
export const ProfileInput = Profile.omit({ id: true, pdfParseConfirmed: true });
export type ProfileInput = z.infer<typeof ProfileInput>;

const ImportRef = z.strictObject({ importId: OpaqueId });
const WithProfile = z.strictObject({ importId: OpaqueId, profile: ProfileInput });

export const IMPORT_SCHEMAS = {
  /** helper 開系統檔案選取器（只限 PDF）並解析；使用者取消回 cancelled。 */
  'import.pick_pdf': {
    request: bridgeOp('import.pick_pdf', EmptyPayload),
    response: withFailure(
      z.strictObject({
        ok: z.literal(true),
        selection: z.discriminatedUnion('status', [
          z.strictObject({
            status: z.literal('selected'),
            importId: Id,
            displayName: NonEmptyText,
          }),
          z.strictObject({ status: z.literal('cancelled') }),
        ]),
      }),
    ),
  },
  /** 取得解析結果。 */
  'import.get': {
    request: bridgeOp('import.get', ImportRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), result: ImportResult })),
  },
  /** 暫存逐欄校正（不算確認，不能用於生成）。 */
  'import.save_corrections': {
    request: bridgeOp('import.save_corrections', WithProfile),
    response: withFailure(Ack),
  },
  /**
   * 使用者確認校正結果，寫入 Profile 並標為已確認（R10）。
   * 帶的是使用者確認當下看到的內容；解析失敗時也可確認手動輸入的內容（D18）。
   */
  'import.confirm': {
    request: bridgeOp('import.confirm', WithProfile),
    response: withFailure(z.strictObject({ ok: z.literal(true), profileId: Id })),
  },
  /**
   * 用使用者選定的 Claude 模型整理已解析的文字（P1-T069）：在背景執行、立即回狀態；已有執行中的就回同一個。
   * 姓名與聯絡資料在本機抽出、不送模型。找不到匯入、解析失敗、沒有選定且可用的模型、超過輸入預算回
   * invalid_request（固定訊息），不呼叫模型。
   */
  'import.ai_parse': {
    request: bridgeOp('import.ai_parse', ImportRef),
    response: withFailure(z.strictObject({ ok: z.literal(true), parse: ImportAiParseView })),
  },
  /** 最近一次 AI 整理的狀態與（成功時）草稿；沒有整理過（或 helper 重開）為 null。 */
  'import.ai_status': {
    request: bridgeOp('import.ai_status', ImportRef),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), parse: ImportAiParseView.nullable() }),
    ),
  },
} as const;
