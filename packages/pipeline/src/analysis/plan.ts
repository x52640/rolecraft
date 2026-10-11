/**
 * 分析計畫（F05、R2、R8、R9）：
 * 1. 既有事實項依 R2 重新判定（區塊沒變的換到新版本位置；有變的待複核；來源移除的標示）。
 * 2. 只挑新增或變更、且「已授權」的文件分析；待確認、已撤銷的文件內容一律不送出（D5）。
 * 3. 每份文件依預算拆成單元（一份文件的一批片段），每單元記錄估算值、預算與來源位置；
 *    估算超過預算就失敗，不產生計畫（不得送出）。
 */
import type { Claim, Id } from '@rolecraft/contracts';
import {
  estimateTokens,
  evaluateClaimSources,
  normalizeText,
  planBatches,
  SEGMENT_OVERHEAD_TOKENS,
  type BatchSegment,
  type InputBudget,
  type SourceState,
} from '@rolecraft/domain';

import { documentLabelOf, promptSkeleton, segmentWrapper } from '../prompts/analysis-prompt.ts';
import { segmentLabel } from './drafts.ts';
import { globalSummaryTokenBound } from './summary.ts';
import type {
  AnalysisDocument,
  AnalysisPlan,
  AnalysisUnitSpec,
  AnalyzedVersion,
  DocumentSummary,
  PlannedSegment,
} from './types.ts';

/** 單元片段數上限（片段編號 S1–S9999）。 */
export const MAX_SEGMENTS_PER_UNIT = 9_999;

export interface PlanAnalysisInput {
  /** 目前仍存在的來源文件（含待確認、已撤銷） */
  readonly documents: readonly AnalysisDocument[];
  /** 已被刪除的來源文件 */
  readonly deletedDocumentIds: readonly Id[];
  /** 上次分析完成時的版本 */
  readonly analyzed: readonly AnalyzedVersion[];
  readonly existingClaims: readonly Claim[];
  /** 全域履歷摘要各段（`mergeDocumentSummaries`）；來源不是已授權的段落不放進計畫 */
  readonly globalSummary: readonly DocumentSummary[];
  readonly budget: InputBudget;
  readonly newId: () => Id;
}

export type PlanAnalysisResult =
  | {
      readonly ok: true;
      /** 沒有要分析的文件時為 null */
      readonly plan: AnalysisPlan | null;
      /** R2 判定後有變動的事實項（完整新內容） */
      readonly claimUpdates: readonly Claim[];
      /** 本次要分析的文件 */
      readonly documentsToAnalyze: readonly Id[];
      /** 內容只有空白、不需送出的文件（可直接記為已分析） */
      readonly emptyDocuments: readonly AnalyzedVersion[];
    }
  | {
      readonly ok: false;
      readonly reason: 'fixed_exceeds_budget' | 'budget_too_small';
      readonly sourceDocumentId: Id;
      /** R2 判定仍要保存（來源變更造成的失效不能因預算失敗而遺失） */
      readonly claimUpdates: readonly Claim[];
    };

function sourceStates(input: PlanAnalysisInput): Map<Id, SourceState> {
  const states = new Map<Id, SourceState>();
  for (const id of input.deletedDocumentIds) states.set(id, { kind: 'deleted' });
  for (const { document, text } of input.documents) {
    states.set(document.id, { kind: 'present', document, text });
  }
  return states;
}

/** R2：既有事實項重新判定；區塊沒變且仍正常的換到新版本位置（含撤銷後重新授權的恢復）。 */
function reviewExisting(input: PlanAnalysisInput, states: Map<Id, SourceState>) {
  const updates: Claim[] = [];
  for (const claim of input.existingClaims) {
    const evaluation = evaluateClaimSources(claim, states);
    let next: Claim = { ...claim, reviewStatus: evaluation.reviewStatus };
    // 擁有者裁定 #15：撤銷恢復依據跟著判定結果寫入或清掉
    delete next.revocationHold;
    if (evaluation.revocationHold) next.revocationHold = evaluation.revocationHold;
    if (evaluation.reviewStatus === 'normal') {
      const excerpts = evaluation.checks.map((c) => c.rebased ?? c.excerpt);
      next = { ...next, basis: { ...claim.basis, sourceExcerpts: excerpts } };
    }
    if (JSON.stringify(next) !== JSON.stringify(claim)) updates.push(next);
  }
  return updates;
}

function needsAnalysis(doc: AnalysisDocument, analyzed: ReadonlyMap<Id, AnalyzedVersion>): boolean {
  if (doc.document.authorizationStatus !== 'authorized') return false;
  const last = analyzed.get(doc.document.id);
  if (!last) return true;
  // R2 要重新分析的文件（片段綁的版本與現況不同）都會落在「沒有對應目前版本的分析紀錄」；
  // 目前版本＋雜湊已分析過時，綁舊版本的待複核事實項不再觸發重新分析（否則每次都重跑）。
  const current =
    last.contentVersion === doc.document.contentVersion &&
    last.contentHash === doc.document.contentHash;
  return !current;
}

type UnitsResult =
  | { readonly ok: true; readonly units: AnalysisUnitSpec[] }
  | { readonly ok: false; readonly reason: 'fixed_exceeds_budget' | 'budget_too_small' };

/** 把一份文件拆成單元；每個單元的整份提示估算都不超過預算。 */
function planDocumentUnits(
  doc: AnalysisDocument,
  summaryTokens: number,
  budget: InputBudget,
  newId: () => Id,
): UnitsResult {
  const text = normalizeText(doc.text);
  const skeleton = promptSkeleton('', documentLabelOf(doc.document.documentPath));
  // 摘要在送出前才組合（會移除失效來源），這裡用上界估算；+1 是骨架拆開後進位的差額。
  const summaryReserve = summaryTokens + 1;
  const fixedTokens = estimateTokens(skeleton) + summaryReserve;
  const wrapperTokens = estimateTokens(segmentWrapper(segmentLabel(MAX_SEGMENTS_PER_UNIT - 1)));
  // domain 拆批每片段只預留 SEGMENT_OVERHEAD_TOKENS；包裝較長時先把預算扣掉差額，
  // 保證單一片段加上實際包裝仍放得下。
  const extra = Math.max(0, wrapperTokens - SEGMENT_OVERHEAD_TOKENS);
  const segmenting = planBatches({
    budget: { ...budget, available: budget.available - extra - summaryReserve },
    fixed: [skeleton],
    pieces: [{ sourceId: doc.document.id, text }],
  });
  if (!segmenting.ok) return segmenting;
  const segments: BatchSegment[] = segmenting.batches.flatMap((b) => [...b.segments]);

  const units: AnalysisUnitSpec[] = [];
  let current: PlannedSegment[] = [];
  let tokens = fixedTokens;
  const flush = () => {
    if (current.length === 0) return;
    units.push({
      unitId: newId(),
      sourceDocumentId: doc.document.id,
      contentVersion: doc.document.contentVersion,
      contentHash: doc.document.contentHash,
      segments: current,
      estimatedTokens: tokens,
      budget,
    });
    current = [];
    tokens = fixedTokens;
  };
  for (const seg of segments) {
    const cost = seg.estimatedTokens + wrapperTokens;
    if (tokens + cost > budget.available || current.length >= MAX_SEGMENTS_PER_UNIT) flush();
    if (fixedTokens + cost > budget.available) return { ok: false, reason: 'budget_too_small' };
    current.push({
      start: seg.start,
      end: seg.end,
      estimatedTokens: seg.estimatedTokens,
      split: seg.split,
    });
    tokens += cost;
  }
  flush();
  return { ok: true, units };
}

/** 建立分析計畫（純函式；ID 由呼叫端注入）。 */
export function planAnalysis(input: PlanAnalysisInput): PlanAnalysisResult {
  const states = sourceStates(input);
  const updates = reviewExisting(input, states);
  const analyzed = new Map(input.analyzed.map((a) => [a.sourceDocumentId, a]));

  const units: AnalysisUnitSpec[] = [];
  const documentsToAnalyze: Id[] = [];
  const emptyDocuments: AnalyzedVersion[] = [];
  const authorized = new Set(
    input.documents
      .filter((d) => d.document.authorizationStatus === 'authorized')
      .map((d) => d.document.id),
  );
  const globalSummary = input.globalSummary.filter((e) => authorized.has(e.sourceDocumentId));
  const summaryTokens = globalSummaryTokenBound(globalSummary);
  for (const doc of input.documents) {
    if (!needsAnalysis(doc, analyzed)) continue;
    const { id, contentVersion, contentHash } = doc.document;
    if (!/\S/u.test(doc.text)) {
      emptyDocuments.push({ sourceDocumentId: id, contentVersion, contentHash });
      continue;
    }
    const planned = planDocumentUnits(doc, summaryTokens, input.budget, input.newId);
    if (!planned.ok) {
      return { ok: false, reason: planned.reason, sourceDocumentId: id, claimUpdates: updates };
    }
    documentsToAnalyze.push(id);
    units.push(...planned.units);
  }
  const plan = units.length > 0 ? { jobId: input.newId(), globalSummary, units } : null;
  return { ok: true, plan, claimUpdates: updates, documentsToAnalyze, emptyDocuments };
}
