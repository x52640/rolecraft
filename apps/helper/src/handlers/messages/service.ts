// 招募訊息與回覆草稿（messages.*、submit_message_capture、request_draft）handler 用的服務介面；
// P1-T029 可增加方法並實作。沒有任何送出方法（D7）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
import type { BridgeRequestOf } from '@rolecraft/contracts';

export interface MessagesService {
  /** 保存使用者選定（或手動貼上）的訊息（F08），回傳訊息草稿 ID。 */
  submitCapture(
    payload: BridgeRequestOf<'submit_message_capture'>['payload'],
  ): Promise<{ messageDraftId: string }>;
  /** 排入回覆草稿生成工作（R9），回傳工作 ID。服務與模型由 helper 決定。 */
  requestDraft(
    payload: BridgeRequestOf<'request_draft'>['payload'],
  ): Promise<{ workJobId: string }>;
}
