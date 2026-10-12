import { z } from 'zod';

/**
 * import.* 的欄位草稿積木（P1-T020、P1-T066、P1-T069；D28 起由 PDF 與網頁來源共用）。
 * 從 import.ts 搬來（形狀不變），讓網頁來源（import-web.ts）共用同一套草稿結構而不形成循環匯入。
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

/**
 * 一個待校正欄位：值＋出處（頁碼、該頁第幾行）。一律未確認。
 * containsPersonalData（D28／W7，相加選填）：AI 草稿還原佔位字時還原出姓名或聯絡資料。
 */
export const ImportDraftField = z.strictObject({
  value: z.string(),
  pageNumber: z.int().min(1),
  lineIndex: z.int().min(0),
  containsPersonalData: z.boolean().optional(),
});
export type ImportDraftField = z.infer<typeof ImportDraftField>;

/** 一段經歷的欄位（出處形狀由 field 決定：PDF 頁／行、網頁區塊編號）。 */
export function experienceOf<F extends z.ZodType>(field: F) {
  return z.strictObject({
    company: field.nullable(),
    title: field.nullable(),
    startDate: field.nullable(),
    endDate: field.nullable(),
    current: z.boolean(),
    description: field.nullable(),
  });
}

/** 結構化草稿裡的一段經歷（P1-T066）。找不到的欄位為 null；current＝仍在職（此時 endDate 為 null）。 */
export const ImportStructuredExperience = experienceOf(ImportDraftField);
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

/**
 * AI 整理（P1-T069）丟棄某個欄位的原因：
 * - unknown_line：引用的行號不存在，或是本機已移除（聯絡資料）的行；網頁來源（D28）＝引用的區塊同理
 * - lines_not_consecutive：非描述欄位引用的行（網頁來源：區塊）不連續
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

/** AI 草稿的欄位結構（出處形狀由 field 決定）。 */
export function aiDraftOf<F extends z.ZodType>(field: F) {
  return z.strictObject({
    personalInfo: z.array(z.strictObject({ label: z.string().min(1), value: field })),
    education: z.array(field),
    experiences: z.array(experienceOf(field)),
    skills: z.array(field),
    otherSections: z.array(z.strictObject({ heading: field, body: field })),
    discarded: z.array(ImportAiDiscard),
  });
}

/**
 * AI 整理後、逐欄照抄檢查通過的草稿（P1-T069）。每個值都能在其出處行找到（出處＝第一個引用行）。
 * personalInfo 是本機抽出的姓名與聯絡資料（從未送給模型）；otherSections 是求職條件、自傳等段落
 * （標題原樣保留，不寫入 Profile，只給使用者參考）。
 */
export const ImportAiDraft = aiDraftOf(ImportDraftField);
export type ImportAiDraft = z.infer<typeof ImportAiDraft>;

/**
 * 通過照抄檢查的 AI 草稿序列化後 UTF-8 上限（D28／W3，PDF 與網頁共用）：超過整份判失敗
 * （invalid_output）、不回傳草稿，所以 import.ai_status 的回應一定低於 1 MiB。
 */
export const IMPORT_AI_DRAFT_MAX_BYTES = 512 * 1024;

/** AI 整理失敗原因：輸出格式不符（含草稿超過大小上限，不自動重試）、R6 不通過、服務錯誤、額度用完、取消。 */
export const ImportAiFailure = z.enum([
  'invalid_output',
  'run_check_failed',
  'provider_error',
  'quota_exhausted',
  'cancelled',
]);
export type ImportAiFailure = z.infer<typeof ImportAiFailure>;
