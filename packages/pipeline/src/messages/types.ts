/** 招募訊息回覆草稿（F08；D6、D7、R10）的共用型別。全部是可序列化的純資料。 */
import type { Claim, Id, JobSnapshot, MessageDraft } from '@rolecraft/contracts';
import type { InputBudget } from '@rolecraft/domain';

/** 回覆意圖：接受邀約、詢問職務、婉拒（F08 所舉三種）。其他值一律視為「意圖不明」。 */
export type ReplyIntent = 'accept' | 'inquire' | 'decline';

/** 生成當下的輸入（呼叫端從 storage 讀出；送出前與檢查都用同一份）。 */
export interface DraftInputs {
  readonly message: MessageDraft | null;
  readonly jobSnapshot: JobSnapshot | null;
  /** 全部事實項；只有可用於生成的才會送出（R1、R2） */
  readonly claims: readonly Claim[];
}

/** 草稿計畫：單一單元（R9）。關聯職缺時記下計畫當下的確認時間，送出前必須相同。 */
export interface DraftPlan {
  readonly jobId: Id;
  readonly unitId: Id;
  readonly messageDraftId: Id;
  readonly intent: ReplyIntent;
  readonly jobSnapshotId: Id | null;
  readonly snapshotConfirmedAt: string | null;
  /** 計畫當下的草稿；寫入時若已被使用者改過就不覆蓋 */
  readonly draftAtPlan: string;
  readonly budget: InputBudget;
}

/** 模型輸出（已通過格式驗證，尚未對照事實項）。 */
export interface DraftOutput {
  readonly draft: string;
  /** 本機編號 C1、C2…（草稿提到的經歷所根據的事實項） */
  readonly citations: readonly string[];
}

/** 草稿被整份丟棄的原因（不修補、不降級）。 */
export type DraftProblem =
  | 'unknown_claim' // 引用了沒提供的事實項編號
  | 'duplicate_citation' // 重複引用
  | 'number_not_in_claims' // 數字不在引用的事實項中
  | 'link_not_in_claims' // 網址或網域不在引用的事實項中
  | 'multiplier_not_in_claims' // 倍數／比例詞不在引用的事實項中
  | 'commits_time' // 提到時間或日期（不得承諾面試時間）
  | 'commits_salary' // 提到薪資待遇
  | 'commits_start_date' // 提到到職、開始、加入等
  | 'contact_info'; // email 樣式或通訊軟體帳號

/** 單元通過檢查後要一次寫入的結果。 */
export interface DraftResult {
  readonly messageDraftId: Id;
  readonly replyIntent: ReplyIntent;
  readonly draft: string;
  /** 草稿引用的事實項 ID */
  readonly citedClaimIds: readonly Id[];
}
