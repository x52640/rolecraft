// analysis.status 的回應（P1-T060）：最近一次分析工作，從資料區組出（helper 重開後仍查得到）。
import { AnalysisStatusView } from '@rolecraft/contracts';
import type { Repositories } from '@rolecraft/storage';

export function latestAnalysisStatus(repos: Repositories): AnalysisStatusView | null {
  const row = repos.analysisState.latestJob();
  if (row === null) return null;
  const job = repos.workJobs.get(row.jobId);
  if (job === null) return null;
  // 被擋（R6 不通過等）時工作已回到已暫停；畫面顯示被擋的原因，不顯示暫停原因
  const blocked = job.status === 'paused' && row.blockReason !== null;
  return AnalysisStatusView.parse({
    workJobId: job.id,
    state: blocked ? 'blocked' : job.status,
    pauseReason: blocked ? null : job.pauseReason,
    blockReason: blocked ? row.blockReason : null,
    completedUnits: job.units.filter((u) => u.status === 'completed').length,
    totalUnits: job.units.length,
    claimsAdded: row.claimsAdded,
    claimsUpdated: row.claimsUpdated,
  });
}
