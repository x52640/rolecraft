// 分析單元寫入（P1-T060，R9；RESIDUALS P1-T046）：新事實項、既有事實項的更新（同文件矛盾升為來源矛盾）、
// 工作狀態、計數、該文件的摘要與「已分析版本」全部在同一個交易，任一步失敗整筆不寫入。
import type { DatabaseSync } from 'node:sqlite';

import type { Claim, WorkJob } from '@rolecraft/contracts';
import type { WrittenOutput } from '@rolecraft/domain';
import {
  DOCUMENT_SUMMARY_MAX_CHARS,
  documentLabelOf,
  type AnalysisPlan,
  type UnitAnalysisResult,
} from '@rolecraft/pipeline';
import { transaction, type Repositories } from '@rolecraft/storage';

const TRUNCATED = '…（摘要已截斷）';

function clip(text: string): string {
  if (text.length <= DOCUMENT_SUMMARY_MAX_CHARS) return text;
  return text.slice(0, DOCUMENT_SUMMARY_MAX_CHARS - TRUNCATED.length) + TRUNCATED;
}

export interface UnitCommit {
  readonly job: WorkJob;
  readonly written: WrittenOutput<UnitAnalysisResult>;
  readonly claimUpdates: readonly Claim[];
}

/**
 * 摘要：該文件在本計畫的第一個單元整段換掉，之後的單元接在後面（同 mergeDocumentSummaries）。
 * 該文件在本計畫的單元全部完成時，才記為「已分析」這個版本（之後的增量分析才會略過它）。
 */
export function createUnitCommitter(db: DatabaseSync, repos: Repositories, plan: AnalysisPlan) {
  return ({ job, written, claimUpdates }: UnitCommit): Promise<void> => {
    const result = written.output;
    const docId = result.sourceDocumentId;
    const docUnits = plan.units.filter((u) => u.sourceDocumentId === docId).map((u) => u.unitId);
    transaction(db, () => {
      for (const claim of result.claims) repos.claims.save(claim);
      for (const claim of claimUpdates) repos.claims.save(claim);
      repos.workJobs.save(job);
      repos.analysisState.addCounts(job.id, result.claims.length, claimUpdates.length);

      const summary = result.summary.trim();
      const first = docUnits[0] === result.unitId;
      const previous = repos.analysisState
        .listSummaries()
        .find((s) => s.sourceDocumentId === docId);
      const parts = first ? [summary] : [previous?.text ?? '', summary];
      const text = clip(parts.filter((p) => p.length > 0).join('\n'));
      const document = repos.sourceDocuments.get(docId);
      const label = document ? documentLabelOf(document.documentPath) : (previous?.label ?? '');
      repos.analysisState.saveSummary({ sourceDocumentId: docId, label, text });

      const done = new Set(job.units.filter((u) => u.status === 'completed').map((u) => u.id));
      if (docUnits.every((id) => done.has(id))) {
        repos.analysisState.saveAnalyzed({
          sourceDocumentId: docId,
          contentVersion: result.contentVersion,
          contentHash: result.contentHash,
        });
      }
    });
    return Promise.resolve();
  };
}
