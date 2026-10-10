/**
 * R2 來源矛盾標記。矛盾偵測由 pipeline 的重新分析判斷；這裡只定義標記的資料結構，
 * 以及把標記套到事實項上（改成「來源矛盾」，按未知處理直到使用者確認）。
 */

import type { Claim, Id, SourceExcerpt } from '@rolecraft/contracts';

import { escalateReviewStatus } from './evaluate.ts';

export type SourceConflictScope =
  | 'cross_document' // 兩份（以上）文件之間互相矛盾
  | 'same_document'; // 同一文件內的更正、撤回（例如一處寫完成、另一處寫計畫中或已撤下）

export interface SourceConflictMark {
  readonly scope: SourceConflictScope;
  /** 受影響的事實項（至少一個） */
  readonly claimIds: readonly Id[];
  /** 互相矛盾的來源片段（至少兩個），供畫面並列顯示 */
  readonly excerpts: readonly SourceExcerpt[];
  /** 矛盾說明（顯示用，資料不是指令） */
  readonly summary: string;
}

/** 檢查標記結構；不合法回傳錯誤訊息，合法回傳 null。 */
export function validateConflictMark(mark: SourceConflictMark): string | null {
  if (mark.claimIds.length === 0) return '矛盾標記至少要指向一個事實項';
  if (mark.excerpts.length < 2) return '矛盾標記至少要有兩個來源片段';
  if (mark.summary.trim().length === 0) return '矛盾標記要有說明';
  const documents = new Set(mark.excerpts.map((e) => e.sourceDocumentId));
  if (mark.scope === 'same_document' && documents.size !== 1) {
    return '同文件矛盾的片段必須來自同一份文件';
  }
  if (mark.scope === 'cross_document' && documents.size < 2) {
    return '跨文件矛盾的片段必須來自至少兩份文件';
  }
  return null;
}

/**
 * 把矛盾標記套到事實項：被標到的改為來源矛盾，其餘不動。
 * 標記不合法或指向不存在的事實項時丟錯（不默默略過）。
 */
export function applyConflictMarks(
  claims: readonly Claim[],
  marks: readonly SourceConflictMark[],
): Claim[] {
  const known = new Set(claims.map((c) => c.id));
  const marked = new Set<Id>();
  for (const mark of marks) {
    const problem = validateConflictMark(mark);
    if (problem) throw new Error(problem);
    for (const id of mark.claimIds) {
      if (!known.has(id)) throw new Error(`矛盾標記指向不存在的事實項：${id}`);
      marked.add(id);
    }
  }
  return claims.map((claim) =>
    marked.has(claim.id)
      ? { ...claim, reviewStatus: escalateReviewStatus(claim.reviewStatus, 'source_conflict') }
      : claim,
  );
}
