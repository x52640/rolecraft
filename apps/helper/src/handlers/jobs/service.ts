// 職缺快照（jobs.* 與 submit_job_capture）handler 用的服務介面（P1-T019）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
// 職缺內容只是資料（D6）：服務只保存與回傳，不解讀、不執行。
import type {
  BridgeRequestOf,
  JobFields,
  JobSnapshot,
  JobSnapshotSummary,
} from '@rolecraft/contracts';

export interface JobsService {
  /** 建立職缺快照（R10），回傳快照 ID。自動擷取與手動貼上都走這裡；新快照未確認、未改過。 */
  submitCapture(
    payload: BridgeRequestOf<'submit_job_capture'>['payload'],
  ): Promise<{ jobSnapshotId: string }>;
  // 以下方法標為選用：沒提供的方法 handler 回 not_implemented，不偽造成功
  // （分派表測試用只有 submitCapture 的假服務驗「未接上」）。實作見 storage-service.ts。
  /** 所有快照摘要（依建立順序）。 */
  list?(): Promise<JobSnapshotSummary[]>;
  /** 單一快照；查不到回 null。 */
  get?(jobSnapshotId: string): Promise<JobSnapshot | null>;
  /**
   * 修改欄位：內容有變才記為使用者改過並清除確認（改過要重新確認）；擷取方式不變。
   * 查不到回 null。
   */
  update?(jobSnapshotId: string, fields: JobFields): Promise<JobSnapshot | null>;
  /** 使用者確認快照，確認時間由服務決定；查不到回 null。 */
  confirm?(jobSnapshotId: string): Promise<JobSnapshot | null>;
}
