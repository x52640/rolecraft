/**
 * 投遞自介送出前準備。任何一項不成立就不送出：
 * - 職缺快照必須存在、且經使用者確認（R10）；確認時間記下，寫入前要相同。
 * - 事實項只取可用狀態的（R1、R2；呼叫端應先套來源關卡）；沒有任何可用事實項不送。
 * - 個人資料只在已確認時送出（R10）；沒有也可以產生。
 * - 提示估算超過預算不送（R8）。
 */
import { JobSnapshot, Profile, type Claim, type Id } from '@rolecraft/contracts';
import { estimateTokens, fitsBudget, type InputBudget } from '@rolecraft/domain';

import { usableClaims } from '../generation/prepare.ts';
import { assembleIntroPrompt } from './prompt.ts';
import type { IntroFeedback, IntroInputs } from './types.ts';

export type IntroPrepareFailure =
  | 'snapshot_missing' // 職缺快照不存在或格式不符
  | 'snapshot_not_confirmed' // 快照未經使用者確認
  | 'no_usable_claims' // 沒有任何可用的事實項
  | 'over_budget'; // 提示估算超過預算

export interface PreparedIntro {
  readonly jobSnapshotId: Id;
  readonly snapshotConfirmedAt: string;
  readonly prompt: string;
  readonly estimatedTokens: number;
  /** 提示中的事實項（順序即 C1、C2…），檢查輸出用同一份 */
  readonly claims: readonly Claim[];
  /** 已確認的個人資料；沒有為 null */
  readonly profile: Profile | null;
  /** 已確認職缺快照的公司名稱與職稱（名稱裡的數字只在名稱內算有出處） */
  readonly jobNames: readonly string[];
}

export type PrepareIntroResult =
  | { readonly ok: true; readonly prepared: PreparedIntro }
  | { readonly ok: false; readonly reason: IntroPrepareFailure };

/** 只收格式正確且 PDF 解析已確認的個人資料。 */
export function confirmedProfile(raw: unknown): Profile | null {
  const parsed = Profile.safeParse(raw);
  return parsed.success && parsed.data.pdfParseConfirmed ? parsed.data : null;
}

export function prepareIntro(
  jobSnapshotId: Id,
  inputs: IntroInputs,
  budget: InputBudget,
  newId: () => string,
  /** 「請 AI 修正」（P1-T071）：上一版草稿與問題，一起放進提示、一起算預算 */
  feedback: IntroFeedback | null = null,
): PrepareIntroResult {
  const snapshot = JobSnapshot.safeParse(inputs.jobSnapshot);
  if (!snapshot.success || snapshot.data.id !== jobSnapshotId) {
    return { ok: false, reason: 'snapshot_missing' };
  }
  const { confirmedAt } = snapshot.data;
  if (confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
  const claims = usableClaims(inputs.claims);
  if (claims.length === 0) return { ok: false, reason: 'no_usable_claims' };
  const profile = confirmedProfile(inputs.profile);
  const prompt = assembleIntroPrompt(
    { job: snapshot.data.fields, claims, profile, feedback },
    newId,
  );
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, budget)) return { ok: false, reason: 'over_budget' };
  return {
    ok: true,
    prepared: {
      jobSnapshotId,
      snapshotConfirmedAt: confirmedAt,
      prompt,
      estimatedTokens,
      claims,
      profile,
      jobNames: [snapshot.data.fields.company, snapshot.data.fields.title],
    },
  };
}
