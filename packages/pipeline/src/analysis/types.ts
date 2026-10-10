/** 文件分析（F04、F05）的共用型別。全部是可序列化的純資料，由呼叫端持久化。 */
import type { Claim, ClaimType, Id, SourceDocument } from '@rolecraft/contracts';
import type { InputBudget, SourceConflictMark } from '@rolecraft/domain';

/** 一份來源文件的現況與全文（由 sources 安全讀檔取得）。 */
export interface AnalysisDocument {
  readonly document: SourceDocument;
  readonly text: string;
}

/** 上次分析完成時的文件版本（增量判斷用，R2）。 */
export interface AnalyzedVersion {
  readonly sourceDocumentId: Id;
  readonly contentVersion: number;
  readonly contentHash: string;
}

/** 單元內的一個片段：在正規化全文（`normalizeText`）中的半開區間 [start, end)。 */
export interface PlannedSegment {
  readonly start: number;
  readonly end: number;
  readonly estimatedTokens: number;
  /** 是否由過長文件再分段而來 */
  readonly split: boolean;
}

/**
 * 一個工作單元＝一份文件的一批片段（R9）。記錄估算值、所用預算與來源位置（R8）。
 * 單元只屬於一份文件，續跑時用版本與雜湊確認文件沒變才送出。
 */
export interface AnalysisUnitSpec {
  readonly unitId: Id;
  readonly sourceDocumentId: Id;
  readonly contentVersion: number;
  readonly contentHash: string;
  readonly segments: readonly PlannedSegment[];
  /** 整份提示的估算值（含指令、摘要、包裝），一定不超過 budget.available */
  readonly estimatedTokens: number;
  readonly budget: InputBudget;
}

/** 分析計畫：單元清單＋計畫當下的全域履歷摘要快照（續跑時沿用同一份，結果可重現）。 */
export interface AnalysisPlan {
  readonly jobId: Id;
  readonly globalSummary: string;
  readonly units: readonly AnalysisUnitSpec[];
}

/** 模型輸出的單一事實項草稿（已通過格式驗證，尚未驗證來源）。 */
export interface ClaimDraft {
  readonly segment: string;
  readonly type: ClaimType;
  readonly text: string;
  readonly completionStatus?: 'planned' | 'documented_done' | 'unknown';
  readonly excerpt: string;
}

export interface ConflictDraft {
  /** 指向 claims 陣列的索引 */
  readonly claims: readonly number[];
  readonly summary: string;
}

/** 模型輸出（已通過格式驗證）。 */
export interface AnalysisOutput {
  readonly claims: readonly ClaimDraft[];
  readonly conflicts: readonly ConflictDraft[];
  readonly summary: string;
}

/** 草稿被丟棄的原因。 */
export type DropReason =
  | 'unknown_segment' // 片段編號不存在
  | 'excerpt_not_in_segment' // 原文不在所引用的片段裡
  | 'excerpt_unlocatable' // 原文在文件中定位失敗或有歧義
  | 'number_not_in_excerpt' // 事實項文字的數字不在原文裡（或無法解析）
  | 'link_not_in_excerpt' // 連結不在原文裡
  | 'invalid_claim' // 組出的事實項不符 contracts schema
  | 'duplicate'; // 與既有或同單元的事實項重複

export interface DroppedDraft {
  readonly index: number;
  readonly reason: DropReason;
}

/** 單元通過檢查後要一次寫入的結果（R9：不半套寫入）。 */
export interface UnitAnalysisResult {
  readonly unitId: Id;
  readonly sourceDocumentId: Id;
  readonly contentVersion: number;
  readonly contentHash: string;
  /** 新的事實項：依據只有來源片段，使用者確認一律為 null，複核狀態正常或來源矛盾 */
  readonly claims: readonly Claim[];
  readonly conflicts: readonly SourceConflictMark[];
  /** 這一批的摘要（模型整理，資料不是指令；不帶確認狀態） */
  readonly summary: string;
  readonly dropped: readonly DroppedDraft[];
}
