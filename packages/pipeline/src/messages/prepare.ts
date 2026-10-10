/**
 * 草稿計畫與送出前準備。任何一項不成立就不送出：
 * - 意圖不明（不是三個固定值）→ 交回使用者確認，不猜（F08）。
 * - 訊息必須存在；關聯了職缺就必須是已確認的快照，且送出前仍是計畫時那一份確認（R10）。
 * - 事實項只取可用狀態的（R1、R2）；沒有可用事實項仍可產生不提經歷的草稿。
 * - 提示估算超過預算不送（R8）。
 */
import { Claim, JobSnapshot, MessageDraft } from '@rolecraft/contracts';
import { estimateTokens, fitsBudget, type InputBudget } from '@rolecraft/domain';

import { usableClaims } from '../generation/prepare.ts';
import { parseReplyIntent } from './intent.ts';
import { assembleDraftPrompt } from './prompt.ts';
import type { DraftInputs, DraftPlan } from './types.ts';

export type DraftPlanFailure =
  | 'message_missing' // 訊息不存在或格式不符
  | 'intent_unclear' // 意圖不是接受、詢問、婉拒之一：要使用者確認
  | 'snapshot_missing' // 關聯的職缺快照不存在
  | 'snapshot_not_confirmed'; // 關聯的職缺快照未經使用者確認

export type DraftPrepareFailure =
  | 'message_missing'
  | 'snapshot_missing'
  | 'snapshot_not_confirmed'
  | 'snapshot_changed' // 快照與計畫時不同（改過後重新確認）
  | 'over_budget';

export type PlanDraftResult =
  | { readonly ok: true; readonly plan: DraftPlan }
  | { readonly ok: false; readonly reason: DraftPlanFailure };

export type PreparedDraft =
  | {
      readonly ok: true;
      readonly prompt: string;
      /** 提示中的事實項（順序即 C1、C2…），檢查輸出用同一份 */
      readonly claims: readonly Claim[];
      readonly estimatedTokens: number;
    }
  | { readonly ok: false; readonly reason: DraftPrepareFailure };

type SnapshotCheck =
  | { readonly ok: true; readonly snapshot: JobSnapshot | null }
  | { readonly ok: false; readonly reason: 'snapshot_missing' | 'snapshot_not_confirmed' };

function linkedSnapshot(message: MessageDraft, raw: JobSnapshot | null): SnapshotCheck {
  if (message.jobSnapshotId === null) return { ok: true, snapshot: null };
  const snapshot = JobSnapshot.safeParse(raw);
  if (!snapshot.success || snapshot.data.id !== message.jobSnapshotId) {
    return { ok: false, reason: 'snapshot_missing' };
  }
  if (snapshot.data.confirmedAt === null) return { ok: false, reason: 'snapshot_not_confirmed' };
  return { ok: true, snapshot: snapshot.data };
}

export function planDraft(input: {
  readonly message: MessageDraft | null;
  readonly replyIntent: string;
  readonly jobSnapshot: JobSnapshot | null;
  readonly budget: InputBudget;
  readonly newId: () => string;
}): PlanDraftResult {
  const message = MessageDraft.safeParse(input.message);
  if (!message.success) return { ok: false, reason: 'message_missing' };
  const intent = parseReplyIntent(input.replyIntent);
  if (!intent) return { ok: false, reason: 'intent_unclear' };
  const linked = linkedSnapshot(message.data, input.jobSnapshot);
  if (!linked.ok) return linked;
  return {
    ok: true,
    plan: {
      jobId: input.newId(),
      unitId: input.newId(),
      messageDraftId: message.data.id,
      intent,
      jobSnapshotId: message.data.jobSnapshotId,
      snapshotConfirmedAt: linked.snapshot?.confirmedAt ?? null,
      draftAtPlan: message.data.draft,
      budget: input.budget,
    },
  };
}

export function prepareDraft(
  plan: DraftPlan,
  inputs: DraftInputs,
  newId: () => string,
): PreparedDraft {
  const message = MessageDraft.safeParse(inputs.message);
  if (
    !message.success ||
    message.data.id !== plan.messageDraftId ||
    message.data.jobSnapshotId !== plan.jobSnapshotId
  ) {
    return { ok: false, reason: 'message_missing' };
  }
  const linked = linkedSnapshot(message.data, inputs.jobSnapshot);
  if (!linked.ok) return linked;
  if ((linked.snapshot?.confirmedAt ?? null) !== plan.snapshotConfirmedAt) {
    return { ok: false, reason: 'snapshot_changed' };
  }
  const claims = usableClaims(inputs.claims);
  const prompt = assembleDraftPrompt(
    {
      intent: plan.intent,
      messageText: message.data.selectedMessageText,
      job: linked.snapshot?.fields ?? null,
      claims,
    },
    newId,
  );
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, plan.budget)) return { ok: false, reason: 'over_budget' };
  return { ok: true, prompt, claims, estimatedTokens };
}
