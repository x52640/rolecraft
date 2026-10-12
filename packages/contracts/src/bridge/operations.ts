import { z } from 'zod';

/**
 * 橋接操作清單（R7）：封閉列舉，helper 只分派這些操作。語意與誰可以呼叫見 docs/specs/bridge.md。
 * 刻意沒有送出訊息、投遞、在求職網站填寫的操作（D7），也沒有任何接受路徑、CLI 參數、
 * 模型設定或指令的操作。開啟編輯器由擴充功能自己開分頁，不經 helper（bridge.md）。
 * 編輯器操作以「群組.動作」命名，群組＝helper `src/handlers/<群組>/`（P1-T041）。
 * 新增操作要先改 spec。
 */
export const BridgeOperation = z.enum([
  // 擷取（content script 也可呼叫；P1-T034）
  'submit_job_capture', // 送入職缺頁擷取內容；編輯器手動貼上職缺也用它
  'submit_message_capture', // 送入使用者選定的訊息；編輯器手動貼上訊息也用它
  'request_draft', // 要求產生回覆草稿
  // jobs：職缺快照（P1-T019）
  'jobs.list',
  'jobs.get',
  'jobs.update',
  'jobs.confirm',
  // import：履歷 PDF 匯入（P1-T020）
  'import.pick_pdf',
  'import.get',
  'import.save_corrections',
  'import.confirm',
  // sources：專案資料夾與授權集合（P1-T021）
  'sources.pick_folders',
  'sources.list_folders',
  'sources.preview',
  'sources.update_authorization',
  'sources.remove_folder',
  // applications：投遞紀錄（P1-T028）
  'applications.list',
  'applications.create',
  'applications.update',
  'applications.delete',
  // providers：供應商狀態（P1-T030）
  'providers.status',
  'providers.recheck',
  'providers.list_candidates',
  'providers.select_candidate',
  'providers.start_login',
  // export：匯出版本（P1-T040）
  'export.create',
  'export.list_versions',
  'export.get_version',
  'export.read_pdf',
  // claims：事實項（P1-T023）
  'claims.list_projects',
  'claims.list',
  'claims.get',
  'claims.confirm',
  'claims.update',
  'claims.reject',
  'claims.list_unassigned', // 未歸專案的事實項（D23、P1-T061）
  // resume：逐段對照與匯出前檢查（P1-T025）
  'resume.generate',
  'resume.list',
  'resume.get',
  'resume.accept_section',
  'resume.reject_section',
  'resume.edit_section',
  'resume.delete_section',
  'resume.confirm_section',
  'resume.check_export',
  // messages：招募訊息回覆草稿（P1-T029）；沒有任何送出操作（D7）
  'messages.list',
  'messages.get',
  'messages.update_draft',
  // analysis：分析授權資料夾產生事實項、查詢進度與手動續跑（P1-T060）；續跑只由使用者觸發（D21）
  'analysis.start',
  'analysis.status',
]);
export type BridgeOperation = z.infer<typeof BridgeOperation>;

/**
 * content script 可以呼叫的操作：只有職缺／訊息擷取（還要再過 relay 的網站、平台、自動擷取檢查）。
 * 其餘操作一律只限擴充功能頁（編輯器）。
 */
export const CONTENT_SCRIPT_OPERATIONS = [
  'submit_job_capture',
  'submit_message_capture',
] as const satisfies readonly BridgeOperation[];
export type ContentScriptOperation = (typeof CONTENT_SCRIPT_OPERATIONS)[number];

/** 失敗代碼；各代碼由誰產生見 docs/specs/bridge.md。 */
export const BridgeErrorCode = z.enum([
  'invalid_request', // 請求不符 schema、不允許，或違反信封協定
  'internal_error', // helper 內部錯誤，或回應不符 schema
  'not_implemented', // helper 尚未接上這個操作的服務
  'helper_unavailable', // 本機輔助程式未安裝、未啟動或連線中斷
  'timeout', // 等待 helper 回覆逾時
]);
export type BridgeErrorCode = z.infer<typeof BridgeErrorCode>;

export const BridgeFailure = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: BridgeErrorCode,
    message: z.string(),
  }),
});
export type BridgeFailure = z.infer<typeof BridgeFailure>;

/** 把某操作的成功回應與共用失敗回應組成該操作的 response schema。 */
export function withFailure<T extends z.ZodObject>(success: T) {
  return z.discriminatedUnion('ok', [success, BridgeFailure]);
}
