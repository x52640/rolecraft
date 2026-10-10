import { z } from 'zod';

import { Id, NonEmptyText, Timestamp, UserConfirmation } from './common.ts';

/** 段落把事實項寫成的完成程度（R1）。 */
export const StatedCompletion = z.enum([
  'completed', // 已完成
  'in_progress', // 進行中
  'planned', // 規劃中
]);
export type StatedCompletion = z.infer<typeof StatedCompletion>;

/**
 * 段落對事實項的引用（R1）。statedCompletion 只對有完成狀態的事實項（功能、交付物）有意義，
 * 其他類型可省略。
 */
export const ClaimCitation = z.strictObject({
  claimId: Id,
  statedCompletion: StatedCompletion.optional(),
});
export type ClaimCitation = z.infer<typeof ClaimCitation>;

/**
 * 段落來源（R1 第 2 輪補）：生成段落的引用不得只移除；無引用段落只有使用者新寫的，
 * 或生成時就無引用的，才能靠逐段確認匯出。
 */
export const SectionOrigin = z.enum([
  'generated', // 模型生成
  'user_written', // 使用者自己新寫
]);
export type SectionOrigin = z.infer<typeof SectionOrigin>;

/**
 * 段落歸屬（P1-T040）：段落印在模板的哪一區。
 * 工作經歷段落用公司＋職稱＋起始日期對到 Profile 的一段經歷（不用索引，經歷重排也不會掛錯公司）；
 * 這三欄只用來比對，印出的公司、職稱、日期一律取自 Profile（R1），對不到就不能匯出。
 */
export const SectionPlacement = z.discriminatedUnion('group', [
  z.strictObject({ group: z.literal('summary') }), // 自我介紹
  z.strictObject({
    group: z.literal('experience'), // 工作經歷（掛在某段經歷下）
    company: NonEmptyText,
    title: NonEmptyText,
    startDate: NonEmptyText,
  }),
  z.strictObject({ group: z.literal('project') }), // 專案
]);
export type SectionPlacement = z.infer<typeof SectionPlacement>;

/** 段落在模板中的項目類型（P1-T040）。 */
export const SectionItemKind = z.enum([
  'paragraph', // 一般段落
  'bullet', // 條列
]);
export type SectionItemKind = z.infer<typeof SectionItemKind>;

/**
 * 逐段接受狀態（F07、ADR-0006 第 9 項，P1-T024 定）：生成段落一開始是 pending；
 * accepted＝接受修改稿（只接受措辭，不確認任何事實項，R1）；rejected＝退回。
 */
export const SectionDecision = z.enum(['pending', 'accepted', 'rejected']);
export type SectionDecision = z.infer<typeof SectionDecision>;

/** 修改理由簡述上限（字元）。 */
export const SECTION_RATIONALE_MAX_CHARS = 300;

/** 履歷的一段。 */
export const ResumeSection = z.strictObject({
  id: Id,
  origin: SectionOrigin,
  text: z.string(),
  citations: z.array(ClaimCitation),
  /** 逐段確認：時間＋該段全文（R1） */
  sectionConfirmation: UserConfirmation.nullable(),
  /**
   * 生成當下的引用快照（R1 第 2 輪補）。生成段落必填、建立後不得修改；
   * 匯出前檢查用它確認引用沒被移除。生成段落缺這欄一律不能匯出（domain 檢查）。
   */
  generatedCitations: z.array(ClaimCitation).optional(),
  /** 段落歸屬（P1-T040）；為維持 additive 設為選填，但缺這欄的非空白段落不能匯出 */
  placement: SectionPlacement.optional(),
  /** 項目類型（P1-T040）；省略視為一般段落 */
  itemKind: SectionItemKind.optional(),
  /** 修改理由簡述（F07；模型整理，資料不是事實依據）。選填：使用者新寫的段落沒有 */
  rationale: z.string().max(SECTION_RATIONALE_MAX_CHARS).optional(),
  /** 逐段接受狀態（F07）。選填：缺省視同 pending */
  decision: SectionDecision.optional(),
});
export type ResumeSection = z.infer<typeof ResumeSection>;

/** 履歷版本（architecture.md ResumeVersion）。 */
export const ResumeVersion = z.strictObject({
  id: Id,
  jobSnapshotId: Id,
  sections: z.array(ResumeSection),
  createdAt: Timestamp,
});
export type ResumeVersion = z.infer<typeof ResumeVersion>;

/** 引用的事實項與片段原文副本（R3）。 */
export const CitedClaimCopy = z.strictObject({
  claimId: Id,
  claimText: NonEmptyText,
  excerptTexts: z.array(NonEmptyText),
});
export type CitedClaimCopy = z.infer<typeof CitedClaimCopy>;
