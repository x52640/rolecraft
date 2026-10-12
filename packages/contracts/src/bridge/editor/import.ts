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
} as const;
