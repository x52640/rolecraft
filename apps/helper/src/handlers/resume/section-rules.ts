// 段落編輯規則（純函式，P1-T025；R1）：
// - 接受修改稿只改 decision，不碰事實項、不碰逐段確認（接受≠確認事實）。
// - 編輯：引用只增不刪（domain checkSectionEdit），新增引用必須指向存在的事實項；
//   既有引用的宣稱完成程度被調低時，要使用者明示已重看措辭（P1-T002 對抗驗證：措辭由 F07 把關）。
// - 任何編輯都讓段落回到「待接受」，並清掉舊的逐段確認（確認的是舊內容）。
import type {
  BridgeRequestOf,
  ClaimCitation,
  ResumeSection,
  StatedCompletion,
} from '@rolecraft/contracts';
import { checkSectionEdit } from '@rolecraft/domain';

import type { ResumeFailureReason } from './service.ts';

export type EditPayload = BridgeRequestOf<'resume.edit_section'>['payload'];

export type EditOutcome =
  { ok: true; section: ResumeSection } | { ok: false; reason: ResumeFailureReason };

const RANK: Record<StatedCompletion, number> = { completed: 3, in_progress: 2, planned: 1 };

/** 未標完成程度視為最低（0）：拿掉「已完成」標示也算調低。 */
const rankOf = (citation: ClaimCitation | undefined): number =>
  citation?.statedCompletion === undefined ? 0 : RANK[citation.statedCompletion];

/** 既有引用中，宣稱完成程度被調低的事實項 ID。 */
export function downgradedClaimIds(
  before: readonly ClaimCitation[],
  after: readonly ClaimCitation[],
): string[] {
  const next = new Map(after.map((c) => [c.claimId, c]));
  return before
    .filter((c) => c.statedCompletion !== undefined && rankOf(next.get(c.claimId)) < rankOf(c))
    .map((c) => c.claimId);
}

function citationsEqual(a: readonly ClaimCitation[], b: readonly ClaimCitation[]): boolean {
  const key = (list: readonly ClaimCitation[]) =>
    JSON.stringify(list.map((c) => [c.claimId, c.statedCompletion ?? null]));
  return key(a) === key(b);
}

/**
 * 套用一次自行編輯。claimExists 只用來檢查「新增」的引用；
 * 原本就有的引用即使事實項已不存在也保留（只能刪整段），由匯出前檢查擋下。
 */
export function applyEdit(
  before: ResumeSection,
  payload: EditPayload,
  claimExists: (claimId: string) => boolean,
): EditOutcome {
  const citations: ClaimCitation[] = payload.citations.map((c) => ({
    claimId: c.claimId,
    ...(c.statedCompletion === undefined ? {} : { statedCompletion: c.statedCompletion }),
  }));
  const ids = citations.map((c) => c.claimId);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'citation_invalid' };
  const existing = new Set(before.citations.map((c) => c.claimId));
  if (ids.some((id) => !existing.has(id) && !claimExists(id))) {
    return { ok: false, reason: 'citation_invalid' };
  }
  const unchanged = payload.text === before.text && citationsEqual(before.citations, citations);
  const after: ResumeSection = {
    ...before,
    text: payload.text,
    citations,
    sectionConfirmation: unchanged ? before.sectionConfirmation : null,
    decision: unchanged ? (before.decision ?? 'pending') : 'pending',
  };
  if (checkSectionEdit(before, after).length > 0) return { ok: false, reason: 'citation_removed' };
  const downgraded = downgradedClaimIds(before.citations, citations);
  if (downgraded.length > 0 && payload.completionDowngradeAcknowledged !== true) {
    return { ok: false, reason: 'completion_downgrade_unacknowledged' };
  }
  return { ok: true, section: after };
}

export function withDecision(
  section: ResumeSection,
  decision: 'accepted' | 'rejected',
): ResumeSection {
  return { ...section, decision };
}
