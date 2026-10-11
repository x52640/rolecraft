/**
 * 草稿 → 事實項（R1、D4、D14）。每一項都要能在來源文件中驗證：
 * - 原文必須逐字（正規化後）落在模型所引用的片段範圍內，且能用 domain 的 `createSourceExcerpt`
 *   在目前版本的全文中定位；定位失敗或有歧義就丟棄，不猜。
 * - 事實項文字中的數字必須出現在原文裡；連結必須完全等於原文中的某個網址，
 *   任何類型的文字裡出現的網址也一樣（不能截斷、拼接或捏造）。
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
import { extractUrls } from './urls.ts';

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
  /**
   * 既有事實項的更新：模型把某草稿列入矛盾，而該草稿與既有（或本次執行已提交的）事實項重複時，
   * 改把那個既有事實項升為「來源矛盾」。呼叫端要與新事實項同一交易寫入。
   */
  readonly claimUpdates: readonly Claim[];
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
  // 網址先比：連結必須完全等於原文中的某個網址；任何類型的文字裡出現的網址也一樣。
  const sourceUrls = new Set(extractUrls(excerptText));
  if (draft.type === 'link' && !sourceUrls.has(draft.text.trim())) return 'link_not_in_excerpt';
  if (extractUrls(draft.text).some((url) => !sourceUrls.has(url))) return 'link_not_in_excerpt';
  const keys = numberKeys(excerptText);
  for (const token of extractNumbers(draft.text)) {
    if (token.key === null || !keys.has(token.key)) return 'number_not_in_excerpt';
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

function existingKeys(claims: readonly Claim[]): Map<string, Claim> {
  const keys = new Map<string, Claim>();
  for (const claim of claims) {
    // 只對「正常」的既有事實項去重：待複核、矛盾、已移除的不能代替新分析的結果。
    if (claim.reviewStatus !== 'normal') continue;
    for (const excerpt of claim.basis.sourceExcerpts) {
      const key = dedupeKey(claim, excerpt);
      if (!keys.has(key)) keys.set(key, claim);
    }
  }
  return keys;
}

/** 被判為重複的草稿實際指向的事實項，以及草稿在本次文件中定位到的片段。 */
interface Alias {
  readonly claim: Claim;
  readonly excerpt: SourceExcerpt;
}

/** 把通過格式驗證的模型輸出轉成事實項；不合格的草稿逐項丟棄並記錄原因。 */
export function convertDrafts(output: AnalysisOutput, ctx: DraftContext): DraftConversion {
  const seen = existingKeys(ctx.existingClaims);
  const dropped: DroppedDraft[] = [];
  const byIndex = new Map<number, Claim>();
  const aliases = new Map<number, Alias>();

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
    const known = seen.get(key);
    if (known) {
      // 重複仍保留對應關係：模型若把這項列入矛盾，改標到原本那個事實項上（不吃掉更正）。
      aliases.set(index, { claim: known, excerpt });
      dropped.push({ index, reason: 'duplicate' });
      return;
    }
    seen.set(key, parsed.data);
    byIndex.set(index, parsed.data);
  });

  return applyDraftConflicts(output, byIndex, aliases, dropped);
}

/**
 * 模型指出的同文件矛盾：涉及且留下來的事實項一律升為「來源矛盾」（只會更嚴格）。
 * 涉及的草稿若因重複被丟棄，改指向它重複的事實項；那是既有事實項時以 claimUpdates 回傳。
 * 有至少兩個不同原文時另產生矛盾標記供畫面並列顯示。
 */
function applyDraftConflicts(
  output: AnalysisOutput,
  byIndex: ReadonlyMap<number, Claim>,
  aliases: ReadonlyMap<number, Alias>,
  dropped: readonly DroppedDraft[],
): DraftConversion {
  const fresh = [...byIndex.values()];
  const freshIds = new Set(fresh.map((c) => c.id));
  const touchedKnown = new Map<Id, Claim>();
  const marks: SourceConflictMark[] = [];
  const flagged = new Set<Id>();
  for (const conflict of output.conflicts) {
    const involved = conflict.claims.flatMap((i): Alias[] => {
      const claim = byIndex.get(i);
      if (claim) return claim.basis.sourceExcerpts.map((excerpt) => ({ claim, excerpt }));
      const alias = aliases.get(i);
      return alias ? [alias] : [];
    });
    const ids = new Set<Id>();
    const excerpts = new Map<string, SourceExcerpt>();
    for (const { claim, excerpt } of involved) {
      ids.add(claim.id);
      flagged.add(claim.id);
      if (!freshIds.has(claim.id)) touchedKnown.set(claim.id, claim);
      excerpts.set(`${excerpt.location}\n${excerpt.text}`, excerpt);
    }
    if (excerpts.size >= 2) {
      marks.push({
        scope: 'same_document',
        claimIds: [...ids],
        excerpts: [...excerpts.values()],
        summary: conflict.summary,
      });
    }
  }
  const all = applyConflictMarks([...fresh, ...touchedKnown.values()], marks).map((claim) =>
    flagged.has(claim.id)
      ? { ...claim, reviewStatus: escalateReviewStatus(claim.reviewStatus, 'source_conflict') }
      : claim,
  );
  return {
    claims: all.filter((c) => freshIds.has(c.id)),
    claimUpdates: all.filter((c) => !freshIds.has(c.id)),
    conflicts: marks,
    dropped,
  };
}
