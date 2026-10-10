// 一個回覆草稿工作（R9）：把 pipeline 的草稿 runner 接到 storage。
// 結果與工作狀態在同一個交易寫入；使用者在產生期間改過草稿，就不覆蓋（只完成工作、丟棄結果）。
// 這裡沒有、也不呼叫任何送出訊息的功能（D7）。
import { createWorkRun } from '@rolecraft/domain';
import { createDraftRunner, type DraftPlan, type DraftReport } from '@rolecraft/pipeline';
import { transaction, type Repositories } from '@rolecraft/storage';
import type { DatabaseSync } from 'node:sqlite';

import type { DraftEngine } from './claude-engine.ts';

export interface DraftJobDeps {
  readonly db: DatabaseSync;
  readonly repos: Repositories;
  readonly engine: DraftEngine;
  readonly newId: () => string;
  readonly now: () => number;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}

/** 可被取消的等待（重試間隔）。 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('已取消'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('已取消'));
      },
      { once: true },
    );
  });
}

/** 建立工作（先存成執行中）並開始執行；回傳的 Promise 在工作停下（完成、暫停、擋下）時結束。 */
export function startDraftJob(plan: DraftPlan, deps: DraftJobDeps): Promise<DraftReport> {
  const { db, repos, engine } = deps;
  const initial = createWorkRun(plan.jobId, [plan.unitId]);
  repos.workJobs.save(initial.job);
  const controller = new AbortController();
  const runner = createDraftRunner(plan, initial, {
    provider: engine.provider,
    model: engine.model,
    execute: (request) => engine.execute(request),
    cancellation: {
      signal: controller.signal,
      abort: () => controller.abort(),
      aborted: () => controller.signal.aborted,
    },
    loadInputs: () =>
      Promise.resolve({
        message: repos.messageDrafts.get(plan.messageDraftId),
        jobSnapshot: plan.jobSnapshotId ? repos.jobSnapshots.get(plan.jobSnapshotId) : null,
        claims: repos.claims.list(),
      }),
    commitUnit: ({ job, written }) => {
      transaction(db, () => {
        repos.workJobs.save(job);
        const current = repos.messageDrafts.get(plan.messageDraftId);
        if (current && current.draft === plan.draftAtPlan) {
          repos.messageDrafts.save({
            ...current,
            replyIntent: written.output.replyIntent,
            draft: written.output.draft,
          });
        }
      });
      return Promise.resolve();
    },
    saveJob: (job) => {
      repos.workJobs.save(job);
      return Promise.resolve();
    },
    recordRunCheck: (record) => {
      repos.runCheckRecords.append(record);
      return Promise.resolve();
    },
    newId: deps.newId,
    now: deps.now,
    sleep: deps.sleep,
  });
  return runner.run().then((report) => {
    // not_sent／blocked 時工作仍是執行中：記為暫停，等使用者重新要求（D21：不自己續跑）。
    if (report.status === 'not_sent' || report.status === 'blocked') {
      repos.workJobs.save({ ...report.job, status: 'paused', pauseReason: 'interrupted' });
    }
    return report;
  });
}
