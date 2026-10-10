/**
 * R2 來源變更判定：新版本文件 vs 事實項綁定的來源片段 → 事實項複核狀態。
 *
 * - 片段所在區塊（含所屬章節標題）完全沒變 → 保留原狀態。
 * - 區塊有任何變更、片段消失、位置無法驗證 → 待複核（已確認的也一樣）。
 * - 來源檔被刪除或不是「已授權」→ 該片段視為來源已移除。
 * - 狀態只升不降：判定結果不會把待複核、來源矛盾自動解除，解除要走使用者確認或重新分析。
 */

import type { Claim, Id, ReviewStatus, SourceDocument, SourceExcerpt } from '@rolecraft/contracts';

import { normalizeText, splitBlocks, type TextBlock } from './blocks.ts';
import { findOccurrences, formatLocation, parseLocation } from './location.ts';

/** 來源文件的現況。呼叫端必須對每個被引用的文件明確給出，缺漏會丟錯（不預設成已移除）。 */
export type SourceState =
  | {
      readonly kind: 'present';
      readonly document: SourceDocument;
      /** 目前版本的全文 */
      readonly text: string;
    }
  | { readonly kind: 'deleted' };

export type ExcerptOutcome =
  | 'unchanged' // 所在區塊完全沒變
  | 'block_changed' // 片段還在，但所在區塊有變更（或被搬到別的章節、跨區塊片段被拆開）
  | 'excerpt_missing' // 文件中已找不到片段原文
  | 'unverifiable' // 位置格式無法解析、版本倒退等：無法證明沒變
  | 'source_removed'; // 來源檔被刪除或撤銷授權

export interface ExcerptCheck {
  readonly excerpt: SourceExcerpt;
  readonly outcome: ExcerptOutcome;
  /** 只有 unchanged 時提供：綁到新版本的片段（版本、雜湊、位置更新，原文不變）。 */
  readonly rebased?: SourceExcerpt;
}

/** 依目前文件判定單一片段。 */
export function checkExcerpt(excerpt: SourceExcerpt, state: SourceState): ExcerptCheck {
  if (state.kind === 'deleted' || state.document.authorizationStatus !== 'authorized') {
    return { excerpt, outcome: 'source_removed' };
  }
  const { document } = state;
  if (document.id !== excerpt.sourceDocumentId) {
    throw new Error(`來源文件不符：片段屬於 ${excerpt.sourceDocumentId}，收到 ${document.id}`);
  }
  const location = parseLocation(excerpt.location);
  const excerptText = normalizeText(excerpt.text);
  if (
    !location ||
    excerptText.trim().length === 0 ||
    document.contentVersion < excerpt.contentVersion ||
    (document.contentVersion === excerpt.contentVersion &&
      document.contentHash !== excerpt.contentHash)
  ) {
    return { excerpt, outcome: 'unverifiable' };
  }

  const text = normalizeText(state.text);
  const positions = findOccurrences(text, excerptText);
  if (positions.length === 0) return { excerpt, outcome: 'excerpt_missing' };

  const blocks = splitBlocks(text);
  const run = findUnchangedRun(blocks, location.fingerprints, text, excerptText);
  if (run === null) return { excerpt, outcome: 'block_changed' };
  return {
    excerpt,
    outcome: 'unchanged',
    rebased: {
      ...excerpt,
      contentVersion: document.contentVersion,
      contentHash: document.contentHash,
      location: formatLocation({ startBlock: run, fingerprints: location.fingerprints }),
    },
  };
}

/**
 * 找一段連續區塊，指紋依序與原位置相同，且片段原文仍完整落在這段區塊內
 * （跨區塊片段連中間的分隔空行也要一樣）。回傳起始區塊序號，找不到回傳 null。
 */
function findUnchangedRun(
  blocks: readonly TextBlock[],
  fingerprints: readonly string[],
  text: string,
  excerptText: string,
): number | null {
  for (let i = 0; i + fingerprints.length <= blocks.length; i++) {
    const run = blocks.slice(i, i + fingerprints.length);
    if (!run.every((b, k) => b.fingerprint === fingerprints[k])) continue;
    const first = run[0];
    const last = run.at(-1);
    if (!first || !last) continue;
    const span = text.slice(first.start, last.end);
    // 片段必須碰到每一個區塊，否則位置與原文對不上（例如跨區塊片段縮成只在其中一塊）。
    const touchesAll = findOccurrences(span, excerptText).some((at) => {
      const start = first.start + at;
      const end = start + excerptText.length;
      return run.every((b) => b.start < end && b.end > start);
    });
    if (touchesAll) return i;
  }
  return null;
}

const SEVERITY: Record<ReviewStatus, number> = {
  normal: 0,
  source_removed: 1,
  needs_review: 2,
  source_conflict: 3,
};

/** 兩個複核狀態取較嚴重者（狀態只升不降）。 */
export function escalateReviewStatus(current: ReviewStatus, next: ReviewStatus): ReviewStatus {
  return SEVERITY[next] > SEVERITY[current] ? next : current;
}

export interface ClaimSourceEvaluation {
  readonly claimId: Id;
  readonly previousStatus: ReviewStatus;
  readonly reviewStatus: ReviewStatus;
  readonly checks: readonly ExcerptCheck[];
  /** 內容版本或雜湊與片段綁定時不同的文件：其他部分有變，需要重新分析整份文件（R2）。 */
  readonly documentsToReanalyze: readonly Id[];
}

/** 判定一個事實項的所有來源片段，回傳新的複核狀態。 */
export function evaluateClaimSources(
  claim: Claim,
  sources: ReadonlyMap<Id, SourceState>,
): ClaimSourceEvaluation {
  const checks: ExcerptCheck[] = [];
  const reanalyze = new Set<Id>();
  for (const excerpt of claim.basis.sourceExcerpts) {
    const state = sources.get(excerpt.sourceDocumentId);
    if (!state) {
      throw new Error(`缺少來源文件現況：${excerpt.sourceDocumentId}（刪除請明確給 deleted）`);
    }
    const check = checkExcerpt(excerpt, state);
    checks.push(check);
    if (
      state.kind === 'present' &&
      check.outcome !== 'source_removed' &&
      (state.document.contentVersion !== excerpt.contentVersion ||
        state.document.contentHash !== excerpt.contentHash)
    ) {
      reanalyze.add(excerpt.sourceDocumentId);
    }
  }
  return {
    claimId: claim.id,
    previousStatus: claim.reviewStatus,
    reviewStatus: escalateReviewStatus(claim.reviewStatus, statusFromChecks(checks)),
    checks,
    documentsToReanalyze: [...reanalyze],
  };
}

function statusFromChecks(checks: readonly ExcerptCheck[]): ReviewStatus {
  if (checks.some((c) => c.outcome !== 'unchanged' && c.outcome !== 'source_removed')) {
    return 'needs_review';
  }
  if (checks.length > 0 && checks.every((c) => c.outcome === 'source_removed')) {
    return 'source_removed';
  }
  return 'normal';
}

/**
 * 事實項能不能用於新的生成（R2）：
 * 待複核、來源矛盾不行；來源已移除只有使用者確認過的可以（依據只剩使用者確認）。
 */
export function isUsableForGeneration(claim: Pick<Claim, 'reviewStatus' | 'basis'>): boolean {
  switch (claim.reviewStatus) {
    case 'normal':
      return true;
    case 'source_removed':
      return claim.basis.userConfirmation !== null;
    case 'needs_review':
    case 'source_conflict':
      return false;
  }
}
