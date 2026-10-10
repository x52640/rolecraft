/**
 * 送出前準備：確認職缺快照仍是計畫時那份且已確認（R10）、Profile 已確認、
 * 只取可用狀態的事實項（R1、R2），組提示並檢查預算（R8）。任何一項不成立就不送出。
 */
import { Claim, JobSnapshot, Profile } from '@rolecraft/contracts';
import {
  estimateTokens,
  fitsBudget,
  isUsableForGeneration,
  type InputBudget,
} from '@rolecraft/domain';

import { assembleGenerationPrompt } from './prompt.ts';
import type { GenerationInputs, GenerationPlan } from './types.ts';

export type GenerationPrepareFailure =
  | 'snapshot_missing' // 職缺快照不存在或格式不符
  | 'snapshot_not_confirmed' // 快照未經使用者確認
  | 'snapshot_changed' // 快照與計畫時不同（改過後重新確認）：要重新規劃
  | 'profile_not_confirmed' // Profile 不存在、格式不符或 PDF 解析未經使用者確認
  | 'no_usable_claims' // 沒有任何可用的事實項
  | 'over_budget'; // 提示估算超過預算

export type PreparedGeneration =
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly profile: Profile;
      /** 職缺快照的公司與職稱（段落不得出現） */
      readonly job: { readonly company: string; readonly title: string };
      /** 提示中的事實項（順序即 C1、C2…），驗證輸出用同一份 */
      readonly claims: readonly Claim[];
      readonly estimatedTokens: number;
    }
  | { readonly ok: false; readonly reason: GenerationPrepareFailure };

/** 只收合法、ID 唯一且可用於生成的事實項（ID 重複的全部排除：無法判定是哪一筆）。 */
export function usableClaims(claims: readonly unknown[]): Claim[] {
  const parsed = claims.flatMap((raw) => {
    const result = Claim.safeParse(raw);
    return result.success ? [result.data] : [];
  });
  const counts = new Map<string, number>();
  for (const claim of parsed) counts.set(claim.id, (counts.get(claim.id) ?? 0) + 1);
  return parsed.filter((claim) => counts.get(claim.id) === 1 && isUsableForGeneration(claim));
}

export function prepareGeneration(
  plan: GenerationPlan,
  inputs: GenerationInputs,
  newId: () => string,
): PreparedGeneration {
  const snapshot = JobSnapshot.safeParse(inputs.jobSnapshot);
  if (!snapshot.success || snapshot.data.id !== plan.jobSnapshotId) {
    return { ok: false, reason: 'snapshot_missing' };
  }
  if (snapshot.data.confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
  if (snapshot.data.confirmedAt !== plan.snapshotConfirmedAt) {
    return { ok: false, reason: 'snapshot_changed' };
  }
  const profile = Profile.safeParse(inputs.profile);
  if (!profile.success || !profile.data.pdfParseConfirmed) {
    return { ok: false, reason: 'profile_not_confirmed' };
  }
  const claims = usableClaims(inputs.claims);
  if (claims.length === 0) return { ok: false, reason: 'no_usable_claims' };
  const prompt = assembleGenerationPrompt(
    { job: snapshot.data.fields, claims, experiences: profile.data.experiences },
    newId,
  );
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, plan.budget)) return { ok: false, reason: 'over_budget' };
  const { company, title } = snapshot.data.fields;
  return {
    ok: true,
    prompt,
    profile: profile.data,
    job: { company, title },
    claims,
    estimatedTokens,
  };
}

export type PlanGenerationResult =
  | { readonly ok: true; readonly plan: GenerationPlan }
  | { readonly ok: false; readonly reason: 'snapshot_missing' | 'snapshot_not_confirmed' };

/**
 * 建立生成計畫（單一單元）。快照必須已經使用者確認（R10）；確認時間記進計畫，
 * 之後快照被改過並重新確認，送出前會判定為 snapshot_changed。
 */
export function planGeneration(input: {
  readonly jobSnapshot: JobSnapshot | null;
  readonly budget: InputBudget;
  readonly newId: () => string;
}): PlanGenerationResult {
  const snapshot = JobSnapshot.safeParse(input.jobSnapshot);
  if (!snapshot.success) return { ok: false, reason: 'snapshot_missing' };
  const { confirmedAt } = snapshot.data;
  if (confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
  return {
    ok: true,
    plan: {
      jobId: input.newId(),
      unitId: input.newId(),
      jobSnapshotId: snapshot.data.id,
      snapshotConfirmedAt: confirmedAt,
      budget: input.budget,
    },
  };
}
