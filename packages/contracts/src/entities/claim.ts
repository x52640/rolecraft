import { z } from 'zod';

import { ContentHash, Id, NonEmptyText, UserConfirmation } from './common.ts';

/** 事實項類型（R1）。 */
export const ClaimType = z.enum([
  'feature', // 功能
  'deliverable', // 交付物
  'personal_role', // 個人角色
  'outcome_metric', // 成果數字
  'user_count', // 使用人數
  'link', // 連結
]);
export type ClaimType = z.infer<typeof ClaimType>;

/** 有完成狀態的事實項類型：只有功能與交付物（R1）。 */
export const CLAIM_TYPES_WITH_COMPLETION: readonly ClaimType[] = ['feature', 'deliverable'];

/** 完成狀態四態（D4、R1）。 */
export const CompletionStatus = z.enum([
  'planned', // 計畫中
  'documented_done', // 文件標示完成（不等於完成，D14）
  'user_confirmed_done', // 使用者確認完成
  'unknown', // 未知
]);
export type CompletionStatus = z.infer<typeof CompletionStatus>;

/** 複核狀態（R1、R2）。 */
export const ReviewStatus = z.enum([
  'normal', // 正常
  'needs_review', // 待複核
  'source_removed', // 來源已移除
  'source_conflict', // 來源矛盾
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/** 來源片段：SourceDocument 版本＋位置＋原文（R1、R2）。 */
export const SourceExcerpt = z.strictObject({
  sourceDocumentId: Id,
  contentVersion: z.int().min(1),
  contentHash: ContentHash,
  /**
   * 片段在文件中的位置（ADR-0006 第 2 項）：`tb1:<起始區塊序號>:<區塊指紋,…>`，
   * 由 @rolecraft/domain `createSourceExcerpt` 產生；格式不符時 R2 判定一律視為無法驗證（待複核）。
   * schema 只要求非空字串，格式驗證在 domain。
   */
  location: NonEmptyText,
  /** 片段原文 */
  text: NonEmptyText,
});
export type SourceExcerpt = z.infer<typeof SourceExcerpt>;

/** 依據：來源片段及／或使用者確認。兩者皆空時一律視為未知（R1）。 */
export const ClaimBasis = z.strictObject({
  sourceExcerpts: z.array(SourceExcerpt),
  userConfirmation: UserConfirmation.nullable(),
});
export type ClaimBasis = z.infer<typeof ClaimBasis>;

/** 事實項（R1）。completionStatus 只在功能、交付物上出現。 */
export const Claim = z
  .strictObject({
    id: Id,
    type: ClaimType,
    /** 事實項內容 */
    text: NonEmptyText,
    completionStatus: CompletionStatus.optional(),
    basis: ClaimBasis,
    reviewStatus: ReviewStatus,
  })
  .superRefine((claim, ctx) => {
    const needsCompletion = CLAIM_TYPES_WITH_COMPLETION.includes(claim.type);
    if (needsCompletion && claim.completionStatus === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['completionStatus'],
        message: '功能與交付物必須有完成狀態',
      });
    }
    if (!needsCompletion && claim.completionStatus !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['completionStatus'],
        message: '只有功能與交付物有完成狀態',
      });
    }
  });
export type Claim = z.infer<typeof Claim>;
