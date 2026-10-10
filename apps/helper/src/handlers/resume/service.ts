// 客製履歷逐段對照（resume.*）handler 用的服務介面（P1-T025）。
// 介面只收 schema 驗證過的 payload，不接受也不回傳路徑、指令或模型設定（R7）。
import type { BridgeRequestOf, BridgeResponseOf, ResumeVersion } from '@rolecraft/contracts';

/** 失敗原因（固定文字，不回填請求內容）；handler 一律轉成 invalid_request。 */
export type ResumeFailureReason =
  | 'version_not_found' // 履歷版本或段落不存在
  | 'snapshot_not_found' // 職缺快照不存在
  | 'snapshot_not_confirmed' // 職缺快照未經使用者確認（R10）
  | 'profile_not_confirmed' // 個人資料不存在或未確認
  | 'no_usable_claims' // 沒有可用於生成的事實項（R1、R2）
  | 'over_budget' // 提示超過輸入預算（R8）
  | 'no_model' // 沒有選定且可用的模型
  | 'already_running' // 同一職缺已有生成工作在跑
  | 'citation_removed' // 只移除引用（R1：要去掉引用只能刪整段）
  | 'citation_invalid' // 引用重複，或新增的引用指向不存在的事實項
  | 'completion_downgrade_unacknowledged' // 宣稱完成程度被調低，未確認已重看措辭
  | 'text_mismatch' // 逐段確認的文字不是該段目前全文
  | 'not_section_confirmable' // 有檢查 2 等不能用逐段確認放行的問題（R1）
  | 'blank_section'; // 空白段落不需確認

export interface ResumeFailure {
  ok: false;
  reason: ResumeFailureReason;
}
export type ResumeResult = { ok: true } | ResumeFailure;

export type GetResult = Extract<BridgeResponseOf<'resume.get'>, { ok: true }>;
export type CheckExportResult = Extract<BridgeResponseOf<'resume.check_export'>, { ok: true }>;

/** 方法皆為選填（同 ExportService）：未提供的方法由 handler 回 not_implemented，不偽造成功。 */
export interface ResumeService {
  /**
   * 針對已確認的職缺快照開始生成（R9、R10），回工作 id；生成在背景執行。
   * 選填：沒有接上模型執行（尚未選定模型等）時 handler 回 not_implemented。
   */
  generate?(jobSnapshotId: string): Promise<{ ok: true; workJobId: string } | ResumeFailure>;
  /** 某職缺的履歷版本；職缺不存在回 null。 */
  list?(jobSnapshotId: string): Promise<ResumeVersion[] | null>;
  get?(resumeVersionId: string): Promise<GetResult | null>;
  /** 接受修改稿：只接受措辭，不確認任何事實項（R1）。 */
  accept?(resumeVersionId: string, sectionId: string): Promise<ResumeResult>;
  reject?(resumeVersionId: string, sectionId: string): Promise<ResumeResult>;
  edit?(payload: BridgeRequestOf<'resume.edit_section'>['payload']): Promise<ResumeResult>;
  /** 刪除整段（去掉引用的唯一方式）。 */
  remove?(resumeVersionId: string, sectionId: string): Promise<ResumeResult>;
  /** 逐段確認：時間由服務決定，記錄該段全文（R1）。 */
  confirm?(payload: BridgeRequestOf<'resume.confirm_section'>['payload']): Promise<ResumeResult>;
  checkExport?(resumeVersionId: string): Promise<CheckExportResult | null>;
}
