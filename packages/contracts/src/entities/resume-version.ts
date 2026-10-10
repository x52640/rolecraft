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

/** 履歷的一段。 */
export const ResumeSection = z.strictObject({
  id: Id,
  origin: SectionOrigin,
  text: z.string(),
  citations: z.array(ClaimCitation),
  /** 逐段確認：時間＋該段全文（R1） */
  sectionConfirmation: UserConfirmation.nullable(),
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
