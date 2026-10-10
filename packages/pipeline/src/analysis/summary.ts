/**
 * 全域履歷摘要（F05）：每份文件一段摘要，彙整成一份放進每批提示的固定內容，
 * 避免只靠片段而遺漏其他工作經歷。摘要由模型整理，只是資料：不帶確認狀態、不是事實來源，
 * 放進提示時一律包在資料區塊內。
 */
import type { Id } from '@rolecraft/contracts';

import type { UnitAnalysisResult } from './types.ts';

/** 每份文件摘要的字元上限。 */
export const DOCUMENT_SUMMARY_MAX_CHARS = 1_000;
/** 全域摘要的字元上限（中文每字估 2 token，約 12k token 以內）。 */
export const GLOBAL_SUMMARY_MAX_CHARS = 6_000;

const TRUNCATED = '…（摘要已截斷）';

export interface DocumentSummary {
  readonly sourceDocumentId: Id;
  /** 顯示用文件名稱（資料） */
  readonly label: string;
  readonly text: string;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - TRUNCATED.length)) + TRUNCATED;
}

/**
 * 把一次工作完成的單元摘要併回各文件摘要：重新分析過的文件整段換掉（依單元順序串接），
 * 不在 `activeDocumentIds`（已刪除、撤銷授權、待確認）的文件摘要一律移除。
 */
export function mergeDocumentSummaries(
  previous: readonly DocumentSummary[],
  results: readonly UnitAnalysisResult[],
  labels: ReadonlyMap<Id, string>,
  activeDocumentIds: ReadonlySet<Id>,
): DocumentSummary[] {
  const fresh = new Map<Id, string[]>();
  for (const result of results) {
    const parts = fresh.get(result.sourceDocumentId) ?? [];
    if (result.summary.trim().length > 0) parts.push(result.summary.trim());
    fresh.set(result.sourceDocumentId, parts);
  }
  const merged = new Map<Id, DocumentSummary>();
  for (const entry of previous) merged.set(entry.sourceDocumentId, entry);
  for (const [id, parts] of fresh) {
    merged.set(id, {
      sourceDocumentId: id,
      label: labels.get(id) ?? merged.get(id)?.label ?? '（未命名）',
      text: clip(parts.join('\n'), DOCUMENT_SUMMARY_MAX_CHARS),
    });
  }
  return [...merged.values()].filter(
    (entry) => activeDocumentIds.has(entry.sourceDocumentId) && entry.text.length > 0,
  );
}

/** 彙整成放進提示的全域摘要文字（有上限）。 */
export function renderGlobalSummary(entries: readonly DocumentSummary[]): string {
  const text = entries.map((e) => `【${e.label}】${e.text}`).join('\n');
  return clip(text, GLOBAL_SUMMARY_MAX_CHARS);
}
