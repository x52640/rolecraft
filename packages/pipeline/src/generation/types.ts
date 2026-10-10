/** 職缺匹配與段落生成（F07；R1、D4、D6、D14）的共用型別。全部是可序列化的純資料。 */
import type {
  Claim,
  Id,
  JobSnapshot,
  Profile,
  ResumeVersion,
  StatedCompletion,
} from '@rolecraft/contracts';
import type { InputBudget } from '@rolecraft/domain';

/** 生成當下的輸入（由呼叫端從 storage 讀出；送出前與驗證都用同一份）。 */
export interface GenerationInputs {
  readonly profile: Profile | null;
  readonly jobSnapshot: JobSnapshot | null;
  readonly claims: readonly Claim[];
}

/** 生成計畫：單一單元（R9）。記錄計畫當下快照的確認時間，送出前必須相同。 */
export interface GenerationPlan {
  readonly jobId: Id;
  readonly unitId: Id;
  readonly jobSnapshotId: Id;
  readonly snapshotConfirmedAt: string;
  readonly budget: InputBudget;
}

/** 模型看到的段落位置：summary（自我介紹）、project（專案）或 E1、E2…（Profile 的第幾段經歷）。 */
export type PlacementDraft = 'summary' | 'project' | `E${number}`;

export interface CitationDraft {
  /** 本機編號 C1、C2… */
  readonly claim: string;
  readonly statedCompletion?: StatedCompletion;
}

export interface SectionDraft {
  readonly placement: PlacementDraft;
  readonly text: string;
  readonly citations: readonly CitationDraft[];
  readonly rationale: string;
}

export interface MatchDraft {
  readonly requirement: string;
  readonly claims: readonly string[];
}

export interface GapDraft {
  readonly requirement: string;
  readonly question: string;
}

/** 模型輸出（已通過格式驗證，尚未對照事實項）。 */
export interface GenerationOutput {
  readonly matches: readonly MatchDraft[];
  readonly gaps: readonly GapDraft[];
  readonly sections: readonly SectionDraft[];
}

/**
 * 段落在履歷中的位置。經歷段落的公司、職稱、日期、原文一律從 Profile 帶入，不由模型產生（R1）。
 */
export type SectionPlacement =
  | { readonly kind: 'summary' }
  | { readonly kind: 'project' }
  | {
      readonly kind: 'experience';
      readonly experienceIndex: number;
      readonly company: string;
      readonly title: string;
      readonly startDate: string;
      readonly endDate: string | null;
      /** 原文（Profile 經歷描述），供逐段對照 */
      readonly originalText: string;
    };

/** 職缺需求與支持證據（事實項 ID）。 */
export interface RequirementMatch {
  readonly requirement: string;
  readonly claimIds: readonly Id[];
}

/** 待補資訊：職缺要的、但沒有可用事實項支持的。 */
export interface InformationGap {
  readonly requirement: string;
  readonly question: string;
}

/** 段落或匹配被丟棄的原因。 */
export type SectionDropReason =
  | 'unknown_placement' // 經歷編號不存在
  | 'no_citation' // 生成段落沒有任何引用
  | 'unknown_claim' // 引用的事實項不存在或不可用
  | 'duplicate_citation' // 同一段重複引用同一事實項
  | 'completion_not_stated' // 引用功能／交付物沒標完成程度
  | 'completion_not_applicable' // 其他類型標了完成程度
  | 'completion_exceeds_claim' // 宣稱完成程度高於事實項狀態（D14）
  | 'number_not_in_claims' // 數字不在引用的事實項中
  | 'link_not_in_claims' // 網址或網域不是引用事實項中的完整網址
  | 'multiplier_not_in_claims' // 倍數／比例詞（翻倍、減半、twice…）不在引用的事實項中
  | 'mentions_job_identity' // 段落寫了職缺快照的公司或職稱
  | 'export_check_failed'; // domain R1 檢查不通過（最後一道）

export interface DroppedSection {
  readonly index: number;
  readonly reason: SectionDropReason;
}

/** 單元通過檢查後要一次寫入的結果（R9：不半套寫入）。 */
export interface GenerationResult {
  readonly resumeVersion: ResumeVersion;
  /** 與 resumeVersion.sections 一一對應 */
  readonly placements: readonly { readonly sectionId: Id; readonly placement: SectionPlacement }[];
  readonly matches: readonly RequirementMatch[];
  readonly gaps: readonly InformationGap[];
  readonly droppedSections: readonly DroppedSection[];
  /** 引用了不存在／不可用事實項而被丟掉的匹配索引 */
  readonly droppedMatches: readonly number[];
}
