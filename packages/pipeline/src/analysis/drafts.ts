/**
 * 草稿 → 事實項（R1、D4、D14）。每一項都要能在來源文件中驗證：
 * - 原文必須逐字（正規化後）落在模型所引用的片段範圍內，且能用 domain 的 `createSourceExcerpt`
 *   在目前版本的全文中定位；定位失敗或有歧義就丟棄，不猜。
 * - 事實項文字中的數字必須出現在原文裡；連結必須是原文裡的字串。
 * - 依據只放來源片段；使用者確認一律為 null，複核狀態一律從「正常」開始（矛盾才升級）。
 */
import { Claim, type Id, type SourceDocument, type SourceExcerpt } from '@rolecraft/contracts';
import {
  applyConflictMarks,
  createSourceExcerpt,
  escalateReviewStatus,
  extractNumbers,
  normalizeExcerpt,
  numberKeys,
  parseLocation,
  type SourceConflictMark,
} from '@rolecraft/domain';

import type {
  AnalysisOutput,
  AnalysisUnitSpec,
  ClaimDraft,
  DroppedDraft,
  DropReason,
} from './types.ts';

export interface DraftContext {
  readonly unit: AnalysisUnitSpec;
  readonly document: Pick<SourceDocument, 'id' | 'contentVersion' | 'contentHash'>;
  /** 已正規化（`normalizeText`）的全文，片段區間以此為準 */
  readonly normalizedText: string;
  /** 既有事實項（去重用） */
  readonly existingClaims: readonly Claim[];
  readonly newId: () => Id;
}

export interface DraftConversion {
  readonly claims: readonly Claim[];
  readonly conflicts: readonly SourceConflictMark[];
  readonly dropped: readonly DroppedDraft[];
}

/** 片段標籤 S1、S2… 對應單元的第幾個片段。 */
export function segmentLabel(index: number): string {
  return `S${String(index + 1)}`;
}

function occurrences(text: string, needle: string): number[] {
  const positions: number[] = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    positions.push(at);
  }
  return positions;
}

/** 在片段範圍內定位原文；回傳來源片段或丟棄原因。 */
function locate(draft: ClaimDraft, ctx: DraftContext): SourceExcerpt | DropReason {
  const index = ctx.unit.segments.findIndex((_, i) => segmentLabel(i) === draft.segment);
  const segment = ctx.unit.segments[index];
  if (!segment) return 'unknown_segment';
  const excerpt = normalizeExcerpt(draft.excerpt);
  if (excerpt.length === 0) return 'excerpt_not_in_segment';
  const all = occurrences(ctx.normalizedText, excerpt);
  const inSegment = all
    .map((at, nth) => ({ at, nth }))
    .filter(({ at }) => at >= segment.start && at + excerpt.length <= segment.end);
  if (inSegment.length === 0) return 'excerpt_not_in_segment';
  // 片段內每一次出現都要落在同一組區塊指紋（同一區塊，或一字不差的多份，與 domain 規則一致），
  // 否則有歧義，丟棄；取片段內第一次出現。
  const located = inSegment.map(({ nth }) =>
    createSourceExcerpt(ctx.document, ctx.normalizedText, excerpt, nth),
  );
  const first = located[0];
  if (!first?.ok) return 'excerpt_unlocatable';
  const key = fingerprintKey(first.excerpt.location);
  const same = located.every((r) => r.ok && fingerprintKey(r.excerpt.location) === key);
  return key !== null && same ? first.excerpt : 'excerpt_unlocatable';
}

function fingerprintKey(location: string): string | null {
  return parseLocation(location)?.fingerprints.join(',') ?? null;
}

function groundingProblem(draft: ClaimDraft, excerptText: string): DropReason | null {
  const keys = numberKeys(excerptText);
  for (const token of extractNumbers(draft.text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_excerpt';
  }
  if (draft.type === 'link' && !excerptText.includes(draft.text.trim())) {
    return 'link_not_in_excerpt';
  }
  return null;
}

function dedupeKey(claim: Claim, excerpt: SourceExcerpt): string {
  return JSON.stringify([
    claim.type,
    claim.text.trim(),
    claim.completionStatus ?? null,
    excerpt.sourceDocumentId,
    excerpt.text,
  ]);
}

function existingKeys(claims: readonly Claim[]): Set<string> {
  const keys = new Set<string>();
  for (const claim of claims) {
    // 只對「正常」的既有事實項去重：待複核、矛盾、已移除的不能代替新分析的結果。
    if (claim.reviewStatus !== 'normal') continue;
    for (const excerpt of claim.basis.sourceExcerpts) keys.add(dedupeKey(claim, excerpt));
  }
  return keys;
}

/** 把通過格式驗證的模型輸出轉成事實項；不合格的草稿逐項丟棄並記錄原因。 */
export function convertDrafts(output: AnalysisOutput, ctx: DraftContext): DraftConversion {
  const seen = existingKeys(ctx.existingClaims);
  const dropped: DroppedDraft[] = [];
  const byIndex = new Map<number, Claim>();

  output.claims.forEach((draft, index) => {
    const excerpt = locate(draft, ctx);
    if (typeof excerpt === 'string') {
      dropped.push({ index, reason: excerpt });
      return;
    }
    const problem = groundingProblem(draft, excerpt.text);
    if (problem) {
      dropped.push({ index, reason: problem });
      return;
    }
    const parsed = Claim.safeParse({
      id: ctx.newId(),
      type: draft.type,
      text: draft.text,
      ...(draft.completionStatus ? { completionStatus: draft.completionStatus } : {}),
      basis: { sourceExcerpts: [excerpt], userConfirmation: null },
      reviewStatus: 'normal',
    });
    if (!parsed.success) {
      dropped.push({ index, reason: 'invalid_claim' });
      return;
    }
    const key = dedupeKey(parsed.data, excerpt);
    if (seen.has(key)) {
      dropped.push({ index, reason: 'duplicate' });
      return;
    }
    seen.add(key);
    byIndex.set(index, parsed.data);
  });

  return applyDraftConflicts(output, byIndex, dropped);
}

/**
 * 模型指出的同文件矛盾：涉及且留下來的事實項一律升為「來源矛盾」（只會更嚴格）。
 * 有至少兩個不同原文時另產生矛盾標記供畫面並列顯示。
 */
function applyDraftConflicts(
  output: AnalysisOutput,
  byIndex: ReadonlyMap<number, Claim>,
  dropped: readonly DroppedDraft[],
): DraftConversion {
  let claims = [...byIndex.values()];
  const marks: SourceConflictMark[] = [];
  const flagged = new Set<Id>();
  for (const conflict of output.conflicts) {
    const involved = conflict.claims.flatMap((i) => byIndex.get(i) ?? []);
    for (const claim of involved) flagged.add(claim.id);
    const excerpts = new Map<string, SourceExcerpt>();
    for (const claim of involved) {
      for (const e of claim.basis.sourceExcerpts) excerpts.set(`${e.location}\n${e.text}`, e);
    }
    if (excerpts.size >= 2) {
      marks.push({
        scope: 'same_document',
        claimIds: involved.map((c) => c.id),
        excerpts: [...excerpts.values()],
        summary: conflict.summary,
      });
    }
  }
  claims = applyConflictMarks(claims, marks).map((claim) =>
    flagged.has(claim.id)
      ? { ...claim, reviewStatus: escalateReviewStatus(claim.reviewStatus, 'source_conflict') }
      : claim,
  );
  return { claims, conflicts: marks, dropped };
}
