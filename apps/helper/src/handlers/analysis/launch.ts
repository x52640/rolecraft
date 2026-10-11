// 分析工作在背景執行（P1-T060，R9）：pipeline 的 analysis runner 接上資料區與授權集合。
// - 每次送出都經選定服務的 execute（providers 的訂閱檢查包裝，R5、R6 每次重做），R6 紀錄逐次保存。
// - 文件一律經 SourceRegistry 讀（只讀授權集合、留讀檔紀錄，R4）；計畫後內容變了就不送出（prepareUnit）。
// - 結束時沒跑完（被擋、計畫過期、例外）：工作改為已暫停，等使用者主動續跑（D21），不自動續跑。
import type { DatabaseSync } from 'node:sqlite';

import type { AnalysisBlockReason, WorkJob } from '@rolecraft/contracts';
import { restoreWorkRun, type WorkRun } from '@rolecraft/domain';
import {
  createAnalysisRunner,
  type AnalysisDocument,
  type AnalysisPlan,
  type RunReport,
} from '@rolecraft/pipeline';
import type { SourceRegistry } from '@rolecraft/sources';
import { newId as storageId, transaction, type Repositories } from '@rolecraft/storage';

import { createUnitCommitter } from './commit.ts';
import type { AnalysisEngine, AnalysisSelection } from './engine.ts';

export interface LaunchDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly registry: SourceRegistry;
  readonly engine: AnalysisEngine;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

/**
 * 送出前重讀文件現況：只有授權集合內、目前仍已授權的文件才讀內容；
 * 內容雜湊與保存的不同時版本加一（prepareUnit 會判定計畫過期、不送出）。
 */
export function documentLoader(deps: LaunchDeps) {
  return async (id: string): Promise<AnalysisDocument | null> => {
    const stored = deps.repos.sourceDocuments.get(id);
    if (stored === null) return null;
    const item = deps.registry.items().find((candidate) => candidate.id === id);
    if (item?.status !== 'authorized') {
      return { document: { ...stored, authorizationStatus: 'revoked' }, text: '' };
    }
    const read = await deps.registry.read(id);
    if (!read.ok) return null;
    const document = { ...stored, authorizationStatus: 'authorized' as const };
    if (read.contentHash === stored.contentHash) return { document, text: read.text };
    const contentVersion = stored.contentVersion + 1;
    return {
      document: { ...document, contentHash: read.contentHash, contentVersion },
      text: read.text,
    };
  };
}

function blockReasonOf(report: RunReport): AnalysisBlockReason | null {
  if (report.status === 'blocked') return report.failure ? 'provider_error' : 'run_check_failed';
  if (report.status === 'not_sent') return 'sources_changed';
  return null;
}

/** 啟動 runner；回傳的 promise 在工作結束（完成、暫停、被擋）後 resolve，不會 reject。 */
export function launchAnalysis(
  deps: LaunchDeps,
  plan: AnalysisPlan,
  initial: WorkRun,
  selection: AnalysisSelection,
): Promise<void> {
  const { db, repos, engine } = deps;
  const controller = new AbortController();
  const runner = createAnalysisRunner(plan, initial, {
    provider: selection.provider,
    model: selection.model,
    execute: (request) => selection.execute(request),
    cancellation: {
      signal: controller.signal,
      abort: () => controller.abort(),
      aborted: () => controller.signal.aborted,
    },
    loadDocument: documentLoader(deps),
    existingClaims: repos.claims.list(),
    commitUnit: createUnitCommitter(db, repos, plan),
    saveJob: (job) => {
      repos.workJobs.save(job);
      return Promise.resolve();
    },
    recordRunCheck: (record) => {
      repos.runCheckRecords.append(record);
      return Promise.resolve();
    },
    newId: storageId,
    now: () => Date.now(),
    sleep: (ms, signal) => (engine.sleep ?? abortableSleep)(ms, signal),
  });

  /** 沒跑完就結束：改為已暫停並記下被擋原因（同一交易），等使用者續跑（D21）。 */
  const settle = (job: WorkJob, reason: AnalysisBlockReason | null) => {
    try {
      transaction(db, () => {
        if (reason !== null) repos.analysisState.setBlockReason(plan.jobId, reason);
        if (job.status === 'running') repos.workJobs.save(restoreWorkRun(job).job);
      });
    } catch {
      // 寫不進去：helper 下次啟動時 pauseInterruptedJobs 會把執行中的工作改為已暫停
    }
  };
  return runner.run().then(
    (report) => settle(report.job, blockReasonOf(report)),
    () => settle(runner.current().job, null),
  );
}
