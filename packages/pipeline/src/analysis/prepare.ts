/**
 * 送出前準備一個單元：重新讀文件、確認版本沒變且仍已授權、組提示、再算一次預算。
 * 任何一項不成立就不送出（R8、D5）。
 */
import type { Id, SourceDocument } from '@rolecraft/contracts';
import { estimateTokens, fitsBudget, normalizeText } from '@rolecraft/domain';

import {
  buildAnalysisPrompt,
  chooseBoundary,
  documentLabelOf,
  promptData,
} from '../prompts/analysis-prompt.ts';
import { segmentLabel } from './drafts.ts';
import type { AnalysisDocument, AnalysisUnitSpec } from './types.ts';

export type PrepareFailure =
  | 'document_missing' // 文件已不存在
  | 'document_not_authorized' // 不再是已授權
  | 'document_changed' // 版本或雜湊與計畫時不同：計畫過期，要重新規劃
  | 'over_budget'; // 實際提示估算超過預算（不應發生，保險）

export type PreparedUnit =
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly document: SourceDocument;
      readonly normalizedText: string;
      readonly estimatedTokens: number;
    }
  | { readonly ok: false; readonly reason: PrepareFailure };

export async function prepareUnit(
  unit: AnalysisUnitSpec,
  globalSummary: string,
  loadDocument: (id: Id) => Promise<AnalysisDocument | null>,
  newId: () => Id,
): Promise<PreparedUnit> {
  const loaded = await loadDocument(unit.sourceDocumentId);
  if (loaded?.document.id !== unit.sourceDocumentId) {
    return { ok: false, reason: 'document_missing' };
  }
  const { document } = loaded;
  if (document.authorizationStatus !== 'authorized') {
    return { ok: false, reason: 'document_not_authorized' };
  }
  if (
    document.contentVersion !== unit.contentVersion ||
    document.contentHash !== unit.contentHash
  ) {
    return { ok: false, reason: 'document_changed' };
  }
  const normalizedText = normalizeText(loaded.text);
  if (unit.segments.some((s) => s.start < 0 || s.end > normalizedText.length || s.start >= s.end)) {
    return { ok: false, reason: 'document_changed' };
  }
  const input = {
    globalSummary,
    documentLabel: documentLabelOf(document.documentPath),
    segments: unit.segments.map((s, i) => ({
      label: segmentLabel(i),
      text: normalizedText.slice(s.start, s.end),
    })),
  };
  const boundary = chooseBoundary(newId, promptData(input));
  const prompt = buildAnalysisPrompt({ ...input, boundary });
  const estimatedTokens = estimateTokens(prompt);
  if (!fitsBudget(estimatedTokens, unit.budget)) return { ok: false, reason: 'over_budget' };
  return { ok: true, prompt, document, normalizedText, estimatedTokens };
}
