// analysis.start／analysis.status 的服務（P1-T060，F04、F05、R2、R4、R8、R9、D21）。
// start：
// 1. 已有執行中的分析 → 回同一個工作 id。
// 2. 沒有選定且可用的模型 → no_model（不讀檔、不呼叫模型）。
// 3. 最近一次分析未完成 → 這次是使用者觸發的續跑：先重做 R6（engine.recheck），不通過就不續跑。
// 4. 同步授權集合 → 來源文件，planAnalysis 依 R2 重新判定既有事實項（含撤銷恢復，P1-T053）。
// 5. 能續跑（計畫仍有效、待跑單元的文件沒變）→ 從第一個未完成單元續跑；否則建新計畫。
//    來源文件、事實項更新與工作狀態在同一交易寫入；然後在背景執行。
import type { DatabaseSync } from 'node:sqlite';

import type { Claim, SourceDocument, WorkJob } from '@rolecraft/contracts';
import { createWorkRun, restoreWorkRun, resumeJob, type WorkRun } from '@rolecraft/domain';
import { planAnalysis, type AnalysisDocument, type AnalysisPlan } from '@rolecraft/pipeline';
import type { SourceRegistry } from '@rolecraft/sources';
import {
  newId as storageId,
  nowTimestamp,
  transaction,
  type AnalyzedDocumentRow,
  type Repositories,
} from '@rolecraft/storage';

import type { AnalysisEngine, AnalysisSelection } from './engine.ts';
import { launchAnalysis } from './launch.ts';
import { decodePlan } from './plan-codec.ts';
import type { AnalysisFailureReason, AnalysisService, StartResult } from './service.ts';
import { latestAnalysisStatus } from './status-view.ts';
import { syncSources } from './sync.ts';

export interface AnalysisDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  /** 授權集合（sources 服務的那一個）：讀檔只經由它 */
  readonly registry: SourceRegistry;
  readonly engine: AnalysisEngine;
  readonly now?: () => string;
  /** 測試用：背景工作結束時通知 */
  readonly onSettled?: (workJobId: string) => void;
}

const fail = (reason: AnalysisFailureReason): StartResult => ({ ok: false, reason });

interface Paused {
  readonly job: WorkJob;
  readonly plan: AnalysisPlan | null;
  readonly sourcesChanged: boolean;
}

/** 計畫仍可續跑：單元與工作一致，且每個未完成單元的文件現在仍已授權、版本與雜湊沒變。 */
function stillValid(paused: Paused, documents: readonly AnalysisDocument[]): AnalysisPlan | null {
  const { plan, job } = paused;
  if (plan === null || paused.sourcesChanged) return null;
  const units = new Map(plan.units.map((u) => [u.unitId, u]));
  if (units.size !== job.units.length || !job.units.every((u) => units.has(u.id))) return null;
  const current = new Map(documents.map((d) => [d.document.id, d.document]));
  const valid = job.units.every((u) => {
    if (u.status === 'completed') return true;
    const spec = units.get(u.id);
    const doc = spec && current.get(spec.sourceDocumentId);
    return (
      doc?.authorizationStatus === 'authorized' &&
      doc.contentVersion === spec?.contentVersion &&
      doc.contentHash === spec.contentHash
    );
  });
  return valid ? plan : null;
}

export function createAnalysis(deps: AnalysisDeps): Required<AnalysisService> {
  const { db, repos, registry, engine } = deps;
  const now = deps.now ?? nowTimestamp;
  let active: string | null = null;
  let starting: Promise<StartResult> | null = null;

  /** 來源文件、R2 判定、空白文件的已分析版本：一起寫（呼叫端包在交易裡）。 */
  const writeChanges = (
    changed: readonly SourceDocument[],
    claimUpdates: readonly Claim[],
    empty: readonly AnalyzedDocumentRow[],
  ) => {
    for (const doc of changed) repos.sourceDocuments.save(doc);
    for (const claim of claimUpdates) repos.claims.save(claim);
    for (const row of empty) repos.analysisState.saveAnalyzed(row);
  };

  const launch = (plan: AnalysisPlan, run: WorkRun, s: AnalysisSelection) => {
    active = plan.jobId;
    void launchAnalysis({ db, repos, registry, engine }, plan, run, s).finally(() => {
      active = null;
      deps.onSettled?.(plan.jobId);
    });
  };

  const pausedJob = (): Paused | null => {
    const row = repos.analysisState.latestJob();
    const job = row && repos.workJobs.get(row.jobId);
    if (!row || !job || job.status === 'completed') return null;
    // 執行中卻不在這個程序裡（不應發生；重開時已改為已暫停）：一樣當成已暫停
    return {
      job: restoreWorkRun(job).job,
      plan: decodePlan(row.plan),
      sourcesChanged: row.blockReason === 'sources_changed',
    };
  };

  async function begin(): Promise<StartResult> {
    if (active !== null) return { ok: true, workJobId: active };
    const selection = await engine.select();
    if (selection === null) return fail('no_model');
    const paused = pausedJob();
    // 續跑前重做 R6（D21：走到這裡一定是使用者按下）；不通過不讀檔、不續跑
    if (paused && !(await engine.recheck(selection.provider))) return fail('run_check_failed');

    const folders = new Map(repos.authorizedFolders.list().map((f) => [f.id, f.absolutePath]));
    const synced = await syncSources({
      registry,
      stored: repos.sourceDocuments.list(),
      claims: repos.claims.list(),
      folderPathOf: (id) => folders.get(id) ?? id,
      now,
    });
    if (!synced.ok) return fail(synced.reason);
    const planned = planAnalysis({
      documents: synced.documents,
      deletedDocumentIds: synced.deletedDocumentIds,
      analyzed: repos.analysisState.listAnalyzed(),
      existingClaims: repos.claims.list(),
      globalSummary: repos.analysisState.listSummaries().filter((s) => s.text.length > 0),
      budget: selection.budget,
      newId: storageId,
    });
    const { claimUpdates } = planned;
    const empty = planned.ok ? planned.emptyDocuments : [];

    const resumable = paused && stillValid(paused, synced.documents);
    const resumed =
      paused && resumable && resumeJob({ job: paused.job, active: null }, { runCheckPassed: true });
    if (paused && resumable && resumed && resumed.ok) {
      const jobId = paused.job.id;
      transaction(db, () => {
        writeChanges(synced.changed, claimUpdates, empty);
        repos.workJobs.save(resumed.run.job);
        repos.analysisState.setBlockReason(jobId, null);
        repos.analysisState.addCounts(jobId, 0, claimUpdates.length);
      });
      launch(resumable, resumed.run, selection);
      return { ok: true, workJobId: jobId };
    }

    if (!planned.ok) {
      // 預算失敗：R2 判定仍要保存（來源變更造成的失效不能遺失）
      transaction(db, () => writeChanges(synced.changed, claimUpdates, []));
      return fail('over_budget');
    }
    const { plan } = planned;
    const run =
      plan &&
      createWorkRun(
        plan.jobId,
        plan.units.map((u) => u.unitId),
      );
    transaction(db, () => {
      writeChanges(synced.changed, claimUpdates, empty);
      // 暫停中的舊工作計畫已過期、不再續跑：標成「來源已變更」，畫面不再提示續跑它
      if (paused) repos.analysisState.setBlockReason(paused.job.id, 'sources_changed');
      if (plan === null || run === null) return;
      repos.workJobs.save(run.job);
      repos.analysisState.createJob({ jobId: plan.jobId, startedAt: now(), plan });
      repos.analysisState.addCounts(plan.jobId, 0, claimUpdates.length);
    });
    if (plan === null || run === null) return { ok: true, workJobId: null };
    launch(plan, run, selection);
    return { ok: true, workJobId: plan.jobId };
  }

  return {
    start() {
      // 同時按兩次：共用同一次啟動，不會建兩個工作
      starting ??= begin().finally(() => {
        starting = null;
      });
      return starting;
    },
    status: () => Promise.resolve(latestAnalysisStatus(repos)),
  };
}
