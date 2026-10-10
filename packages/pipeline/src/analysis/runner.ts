/**
 * 分析工作執行（R9）：一次跑一個單元，完成並通過檢查才一次寫入；
 * 額度用完、取消、重試用盡就暫停並保留已完成單元。續跑只由使用者觸發（D21）：
 * 本模組不會自己續跑，呼叫端要先用 domain 的 `resumeJob`（需 R6 通過）把工作改回執行中，再呼叫 run()。
 * 每次送出都經呼叫端提供的 `execute`（應是 providers 的 `runWithSubscriptionCheck`），R6 每次重做。
 */
import type { Claim, Id, Provider, RunCheckRecord, WorkJob } from '@rolecraft/contracts';
import {
  cancelJob,
  completeUnit,
  failUnit,
  firstPendingUnit,
  startUnit,
  type WorkRun,
  type WrittenOutput,
} from '@rolecraft/domain';
import type { ProviderError, RunOutcome } from '@rolecraft/providers';

import { convertDrafts } from './drafts.ts';
import { parseAnalysisOutput } from './output.ts';
import { prepareUnit, type PrepareFailure } from './prepare.ts';
import type { AnalysisDocument, AnalysisPlan, UnitAnalysisResult } from './types.ts';

/**
 * 取消控制（呼叫端以 AbortController 提供；pipeline 不依賴 DOM／Node 型別，所以訊號型別是泛型）。
 */
export interface Cancellation<S> {
  readonly signal: S;
  abort(): void;
  aborted(): boolean;
}

export interface AnalysisRunnerDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly cancellation: Cancellation<S>;
  /** 由 sources 安全讀檔取得文件現況與全文 */
  readonly loadDocument: (id: Id) => Promise<AnalysisDocument | null>;
  /** 既有事實項（去重用） */
  readonly existingClaims: readonly Claim[];
  /** 單元結果＋新的工作狀態，必須在同一個交易內寫入（不半套寫入） */
  readonly commitUnit: (commit: {
    readonly job: WorkJob;
    readonly written: WrittenOutput<UnitAnalysisResult>;
  }) => Promise<void>;
  /** 保存工作狀態（暫停、重試次數） */
  readonly saveJob: (job: WorkJob) => Promise<void>;
  /** 每次 R6 確認紀錄（S9-2 證據） */
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
  readonly newId: () => Id;
  readonly now: () => number;
  readonly sleep: (ms: number, signal: S) => Promise<void>;
}

export type UnitFailure =
  | { readonly kind: 'provider'; readonly error: ProviderError }
  | { readonly kind: 'invalid_output'; readonly message: string };

export type RunReport =
  | { readonly status: 'completed'; readonly job: WorkJob }
  | { readonly status: 'paused'; readonly job: WorkJob; readonly lastFailure: UnitFailure | null }
  /** R6 不成立：沒有送出，工作狀態不變（未完成單元未記服務） */
  | { readonly status: 'blocked'; readonly job: WorkJob; readonly record: RunCheckRecord }
  /** 送出前發現計畫不能用（文件變了、撤銷授權等）：沒有送出，要重新規劃 */
  | {
      readonly status: 'not_sent';
      readonly job: WorkJob;
      readonly unitId: Id;
      readonly reason: PrepareFailure;
    }
  /** 工作不在執行中（已暫停要先由使用者續跑） */
  | { readonly status: 'not_running'; readonly job: WorkJob };

export interface AnalysisRunner {
  run(): Promise<RunReport>;
  /** 使用者取消：停止目前單元、丟棄其輸出；之後才回來的結果直接丟棄 */
  cancel(): void;
  current(): WorkRun;
}

function sameRoute<S>(record: RunCheckRecord, deps: AnalysisRunnerDeps<S>): boolean {
  return record.provider === deps.provider && record.model === deps.model;
}

export function createAnalysisRunner<S>(
  plan: AnalysisPlan,
  initial: WorkRun,
  deps: AnalysisRunnerDeps<S>,
): AnalysisRunner {
  let run = initial;
  const controller = deps.cancellation;
  const units = new Map(plan.units.map((u) => [u.unitId, u]));

  const paused = async (lastFailure: UnitFailure | null): Promise<RunReport> => {
    await deps.saveJob(run.job);
    return { status: 'paused', job: run.job, lastFailure };
  };

  /** 處理一次失敗；回傳 null 表示已排重試、繼續迴圈。 */
  const fail = async (attemptId: string, failure: UnitFailure): Promise<RunReport | null> => {
    if (failure.kind === 'provider' && failure.error.kind === 'cancelled') {
      const cancelled = cancelJob(run);
      if (cancelled.ok) run = cancelled.run;
      return paused(failure);
    }
    const quota = failure.kind === 'provider' && failure.error.kind === 'quota_exhausted';
    // 格式不合格與其他錯誤都當暫時性：有上限地重試，用盡就暫停，不無限制重試。
    const failed = failUnit(run, {
      attemptId,
      error: quota ? 'quota_exhausted' : 'transient',
      now: deps.now(),
    });
    if (!failed.ok) return paused(failure); // 取消後才回來：丟棄
    run = failed.run;
    if (failed.outcome.action === 'paused') return paused(failure);
    await deps.saveJob(run.job);
    try {
      await deps.sleep(failed.outcome.delayMs, controller.signal);
    } catch (error) {
      if (!controller.aborted()) throw error;
    }
    return null;
  };

  const step = async (): Promise<RunReport | null> => {
    if (run.job.status === 'completed') return { status: 'completed', job: run.job };
    if (run.job.status !== 'running') return paused(null);
    const pending = firstPendingUnit(run.job);
    const unit = pending ? units.get(pending.id) : undefined;
    if (!unit) throw new Error(`計畫中找不到單元：${pending?.id ?? '（無）'}`);

    const prepared = await prepareUnit(unit, plan.globalSummary, deps.loadDocument, deps.newId);
    if (!prepared.ok) {
      return { status: 'not_sent', job: run.job, unitId: unit.unitId, reason: prepared.reason };
    }
    if (run.job.status !== 'running') return paused(null);

    const before = run;
    const attemptId = deps.newId();
    const started = startUnit(run, { attemptId, provider: deps.provider, model: deps.model });
    if (!started.ok) throw new Error(`無法開始單元：${started.reason}`);
    run = started.run;

    const outcome = await deps.execute({ prompt: prepared.prompt, signal: controller.signal });
    await deps.recordRunCheck(outcome.record);
    if (!sameRoute(outcome.record, deps)) throw new Error('執行紀錄的服務或模型與單元不符');
    if (outcome.status === 'blocked') {
      if (run.active?.attemptId === attemptId) run = before;
      return { status: 'blocked', job: run.job, record: outcome.record };
    }
    if (!outcome.result.ok)
      return fail(attemptId, { kind: 'provider', error: outcome.result.error });

    const parsed = parseAnalysisOutput(outcome.result.text);
    if (!parsed.ok) return fail(attemptId, { kind: 'invalid_output', message: parsed.error });
    const converted = convertDrafts(parsed.output, {
      unit,
      document: prepared.document,
      normalizedText: prepared.normalizedText,
      existingClaims: deps.existingClaims,
      newId: deps.newId,
    });
    const result: UnitAnalysisResult = {
      unitId: unit.unitId,
      sourceDocumentId: unit.sourceDocumentId,
      contentVersion: unit.contentVersion,
      contentHash: unit.contentHash,
      claims: converted.claims,
      conflicts: converted.conflicts,
      summary: parsed.output.summary,
      dropped: converted.dropped,
    };
    const completed = completeUnit(run, attemptId, result);
    if (!completed.ok) return paused(null); // 取消後才回來的結果：丟棄，不寫入
    // 先寫入成功才採用新狀態；寫入失敗時錯誤往外丟，單元仍是未完成。
    await deps.commitUnit({ job: completed.run.job, written: completed.written });
    run = completed.run;
    return null;
  };

  return {
    current: () => run,
    cancel: () => {
      controller.abort();
      const cancelled = cancelJob(run);
      if (cancelled.ok) run = cancelled.run;
    },
    run: async () => {
      if (run.job.status !== 'running' || run.active !== null) {
        return run.job.status === 'completed'
          ? { status: 'completed', job: run.job }
          : { status: 'not_running', job: run.job };
      }
      for (;;) {
        const report = await step();
        if (report) return report;
      }
    },
  };
}
