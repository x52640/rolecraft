// 招募訊息與回覆草稿（messages.*、submit_message_capture、request_draft）handler 用的服務介面。
// 沒有任何送出方法（D7）：草稿只能存檔、由使用者自己複製。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
import type { BridgeRequestOf, MessageDraft, MessageSummary } from '@rolecraft/contracts';

/**
 * 不排入工作的原因（handler 一律回 invalid_request＋固定文字，不回填請求內容）：
 * - not_found：訊息 ID 不是 helper 配發過的
 * - intent_unclear：意圖不是接受、詢問、婉拒之一 → 請使用者確認
 * - snapshot_missing／snapshot_not_confirmed：關聯的職缺快照不存在或未確認（R10）
 * - no_service：沒有可用且已選定模型的 AI 服務（不代為挑選）
 * - busy：同一則訊息已有草稿在產生
 */
export type DraftRefusal =
  | 'not_found'
  | 'intent_unclear'
  | 'snapshot_missing'
  | 'snapshot_not_confirmed'
  | 'no_service'
  | 'busy';

export type RequestDraftOutcome = { workJobId: string } | { refused: DraftRefusal };

export interface MessagesService {
  /** 保存使用者選定（或手動貼上）的訊息（F08），回傳訊息草稿 ID。 */
  submitCapture(
    payload: BridgeRequestOf<'submit_message_capture'>['payload'],
  ): Promise<{ messageDraftId: string }>;
  /** 排入回覆草稿生成工作（R9），回傳工作 ID；不符條件時不排入。服務與模型由 helper 決定。 */
  requestDraft(payload: BridgeRequestOf<'request_draft'>['payload']): Promise<RequestDraftOutcome>;
  // 以下方法選用：沒提供時 handler 回 not_implemented，不偽造成功。
  /** 所有訊息摘要（依建立順序）。 */
  list?(): Promise<MessageSummary[]>;
  /** 單一訊息與草稿；查不到回 null。 */
  get?(messageDraftId: string): Promise<MessageDraft | null>;
  /** 儲存使用者編輯的草稿（只存檔、不送出）；查不到回 false。 */
  updateDraft?(messageDraftId: string, draft: string): Promise<boolean>;
}
