// handler 透過這些介面呼叫 storage／sources／pipeline（服務組裝在 helper 啟動時注入）。
// 介面只收 schema 驗證過的 payload，回傳 ID；不接受也不回傳路徑、指令或模型設定（R7）。
// 尚未接上的服務留空，handler 回 not_implemented，不偽造成功。
import type {
  BridgeFailure,
  RequestDraftRequest,
  SubmitJobCaptureRequest,
  SubmitMessageCaptureRequest,
} from '@rolecraft/contracts';

export interface JobCaptureService {
  /** 建立職缺快照（R10），回傳快照 ID。 */
  submit(payload: SubmitJobCaptureRequest['payload']): Promise<{ jobSnapshotId: string }>;
}

export interface MessageCaptureService {
  /** 保存使用者選定的訊息（F08），回傳訊息草稿 ID。 */
  submit(payload: SubmitMessageCaptureRequest['payload']): Promise<{ messageDraftId: string }>;
}

export interface DraftService {
  /** 排入回覆草稿生成工作（R9），回傳工作 ID。服務與模型由 helper 決定。 */
  request(payload: RequestDraftRequest['payload']): Promise<{ workJobId: string }>;
}

export interface HelperServices {
  jobCapture?: JobCaptureService;
  messageCapture?: MessageCaptureService;
  draft?: DraftService;
}

/** 服務尚未接上：回 not_implemented。 */
export function notImplemented(): BridgeFailure {
  return { ok: false, error: { code: 'not_implemented', message: '此操作尚未支援' } };
}
