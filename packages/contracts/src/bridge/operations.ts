import { z } from 'zod';

/**
 * 橋接操作清單（R7）：封閉列舉，helper 只分派這些操作。
 * 刻意沒有送出訊息、投遞、在求職網站填寫的操作（D7），也沒有任何接受路徑、CLI 參數、
 * 模型設定或指令的操作。開啟編輯器由擴充功能自己開分頁，不經 helper（bridge.md）。
 * 新增操作要先改 spec。
 */
export const BridgeOperation = z.enum([
  'submit_job_capture', // 送入職缺頁擷取內容
  'submit_message_capture', // 送入使用者選定的訊息
  'request_draft', // 要求產生草稿
]);
export type BridgeOperation = z.infer<typeof BridgeOperation>;

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
