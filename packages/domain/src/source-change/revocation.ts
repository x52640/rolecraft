/**
 * 撤銷後重新授權的恢復（evidence-model R2，擁有者裁定 #15）：
 *
 * - 事實項「僅因撤銷授權」升為來源已移除時，保存撤銷前狀態、各來源內容指紋與事實項內容。
 * - 每份來源都重新授權、指紋相同、片段判定沒變、事實項內容沒改 → 恢復保存的狀態。
 * - 仍有來源未授權 → 保存值保留；其他任何情況 → 清掉保存值，照 R2 一般規則處理。
 * - 沒有保存值的舊資料一律不恢復。
 */
import type { Claim, Id, ReviewStatus, RevocationHold } from '@rolecraft/contracts';

import type { ExcerptCheck, SourceState } from './evaluate.ts';

export type HoldResolution =
  | { readonly kind: 'restore'; readonly status: RevocationHold['previousStatus'] }
  | { readonly kind: 'keep'; readonly hold: RevocationHold }
  | { readonly kind: 'drop' };

const DROP: HoldResolution = { kind: 'drop' };

/** 事實項內容與保存當下相同（被改過或已被使用者確認就不恢復）。 */
function sameContent(claim: Claim, hold: RevocationHold): boolean {
  return (
    claim.basis.userConfirmation === null &&
    claim.text === hold.claimText &&
    claim.completionStatus === hold.completionStatus
  );
}

/** 依目前來源現況處理事實項上的保存值。沒有保存值一律 drop（舊資料不恢復）。 */
export function resolveRevocationHold(
  claim: Claim,
  sources: ReadonlyMap<Id, SourceState>,
  checks: readonly ExcerptCheck[],
): HoldResolution {
  const hold = claim.revocationHold;
  if (!hold || claim.reviewStatus !== 'source_removed' || !sameContent(claim, hold)) return DROP;
  const saved = new Map(hold.sources.map((s) => [s.sourceDocumentId, s.contentHash]));
  const cited = new Set(claim.basis.sourceExcerpts.map((e) => e.sourceDocumentId));
  if (cited.size === 0 || cited.size !== saved.size || [...cited].some((id) => !saved.has(id))) {
    return DROP;
  }
  let allAuthorized = true;
  for (const check of checks) {
    const id = check.excerpt.sourceDocumentId;
    const hash = saved.get(id);
    const state = sources.get(id);
    if (state?.kind !== 'present') return DROP;
    if (state.document.contentHash !== hash || check.excerpt.contentHash !== hash) return DROP;
    const auth = state.document.authorizationStatus;
    if (auth === 'revoked') {
      allAuthorized = false;
    } else if (auth !== 'authorized' || check.outcome !== 'unchanged') {
      return DROP;
    }
  }
  return allAuthorized ? { kind: 'restore', status: hold.previousStatus } : { kind: 'keep', hold };
}

/**
 * 判定結果升為來源已移除時，若「僅因撤銷授權」就建立保存值；否則 null。
 * 條件：原狀態不是來源已移除、沒有使用者確認、每個片段的來源都是已撤銷，
 * 且片段綁的正是撤銷當下的版本與指紋（否則無法證明撤銷前狀態對應目前內容）。
 */
export function createRevocationHold(
  claim: Claim,
  sources: ReadonlyMap<Id, SourceState>,
  nextStatus: ReviewStatus,
): RevocationHold | null {
  const previous = claim.reviewStatus;
  if (nextStatus !== 'source_removed' || previous === 'source_removed') return null;
  if (claim.basis.userConfirmation !== null || claim.basis.sourceExcerpts.length === 0) return null;
  const hashes = new Map<Id, string>();
  for (const excerpt of claim.basis.sourceExcerpts) {
    const state = sources.get(excerpt.sourceDocumentId);
    if (state?.kind !== 'present') return null;
    const { document } = state;
    if (
      document.authorizationStatus !== 'revoked' ||
      document.contentHash !== excerpt.contentHash ||
      document.contentVersion !== excerpt.contentVersion
    ) {
      return null;
    }
    hashes.set(document.id, document.contentHash);
  }
  return {
    previousStatus: previous,
    sources: [...hashes].map(([sourceDocumentId, contentHash]) => ({
      sourceDocumentId,
      contentHash,
    })),
    claimText: claim.text,
    ...(claim.completionStatus === undefined ? {} : { completionStatus: claim.completionStatus }),
  };
}
