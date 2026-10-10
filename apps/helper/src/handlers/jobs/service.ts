// 職缺快照（jobs.* 與 submit_job_capture）handler 用的服務介面；P1-T019 可增加方法並實作。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
import type { BridgeRequestOf } from '@rolecraft/contracts';

export interface JobsService {
  /** 建立職缺快照（R10），回傳快照 ID。自動擷取與手動貼上都走這裡。 */
  submitCapture(
    payload: BridgeRequestOf<'submit_job_capture'>['payload'],
  ): Promise<{ jobSnapshotId: string }>;
}
