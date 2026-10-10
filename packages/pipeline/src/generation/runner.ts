/**
 * 生成工作執行（R9）：一個工作、一個單元。送出前重讀輸入並檢查（prepare.ts）；
 * 每次送出都經呼叫端的 `execute`（應包 `runWithSubscriptionCheck`，R6 每次重做）。
 * 輸出格式不合格或沒有段落通過檢查 → 整份丟棄、不寫入，比照暫時性錯誤有上限重試；
 * 額度用完、取消、重試用盡就暫停；other 錯誤（401／403、隔離檢查失敗等）不重試、不重送。
 * 續跑只由使用者觸發（D21）：本模組不會自己續跑。
 */
import type { Id, Provider, RunCheckRecord, WorkJob } from '@rolecraft/contracts';
import {
  cancelJob,
  completeUnit,
  failUnit,
  startUnit,
  type WorkRun,
  type WrittenOutput,
} from '@rolecraft/domain';
import type { RunOutcome } from '@rolecraft/providers';

import type { Cancellation, UnitFailure } from '../analysis/runner.ts';
import { parseGenerationOutput } from './output.ts';
import { prepareGeneration, type GenerationPrepareFailure } from './prepare.ts';
import { convertGeneration } from './sections.ts';
import type { GenerationInputs, GenerationPlan, GenerationResult } from './types.ts';

export interface GenerationRunnerDeps<S> {
  readonly provider: Provider;
  readonly model: string;
  /** 送出一次；應包 `runWithSubscriptionCheck`（每次重做 R6、隔離執行） */
  readonly execute: (request: { prompt: string; signal: S }) => Promise<RunOutcome>;
  readonly cancellation: Cancellation<S>;
  /** 每次送出前重讀 Profile、職缺快照與事實項 */
  readonly loadInputs: () => Promise<GenerationInputs>;
  /** 結果＋新的工作狀態，必須在同一個交易內寫入（不半套寫入） */
  readonly commitUnit: (commit: {
    readonly job: WorkJob;
    readonly written: WrittenOutput<GenerationResult>;
  }) => Promise<void>;
  readonly saveJob: (job: WorkJob) => Promise<void>;
  readonly recordRunCheck: (record: RunCheckRecord) => Promise<void>;
  readonly newId: () => Id;
  /** epoch 毫秒；版本時間取自此 */
  readonly now: () => number;
  readonly sleep: (ms: number, signal: S) => Promise<void>;
}

export type GenerationReport =
  | { readonly status: 'completed'; readonly job: WorkJob }
  | { readonly status: 'paused'; readonly job: WorkJob; readonly lastFailure: UnitFailure | null }
  /** R6 不成立（未送出，failure 為 null）或 other 錯誤（不重送）：狀態回到送出前、不寫入 */
  | {
      readonly status: 'blocked';
      readonly job: WorkJob;
      readonly record: RunCheckRecord;
      readonly failure: UnitFailure | null;
    }
  /** 送出前檢查不通過：沒有送出 */
  | {
      readonly status: 'not_sent';
      readonly job: WorkJob;
      readonly reason: GenerationPrepareFailure;
    }
  | { readonly status: 'not_running'; readonly job: WorkJob };

export interface GenerationRunner {
  run(): Promise<GenerationReport>;
  cancel(): void;
  current(): WorkRun;
}

interface Attempt {
  readonly attemptId: string;
  readonly before: WorkRun;
  readonly record: RunCheckRecord;
}

export function createGenerationRunner<S>(
  plan: GenerationPlan,
  initial: WorkRun,
  deps: GenerationRunnerDeps<S>,
): GenerationRunner {
  let run = initial;
  const controller = deps.cancellation;

  const paused = async (lastFailure: UnitFailure | null): Promise<GenerationReport> => {
    await deps.saveJob(run.job);
    return { status: 'paused', job: run.job, lastFailure };
  };

  const fail = async (attempt: Attempt, failure: UnitFailure): Promise<GenerationReport | null> => {
    const { attemptId } = attempt;
    if (failure.kind === 'provider' && failure.error.kind === 'cancelled') {
      const cancelled = cancelJob(run);
      if (cancelled.ok) run = cancelled.run;
      return paused(failure);
    }
    if (failure.kind === 'provider' && failure.error.kind === 'other') {
      if (run.active?.attemptId === attemptId) run = attempt.before;
      return { status: 'blocked', job: run.job, record: attempt.record, failure };
    }
    const quota = failure.kind === 'provider' && failure.error.kind === 'quota_exhausted';
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

  const step = async (): Promise<GenerationReport | null> => {
    if (run.job.status === 'completed') return { status: 'completed', job: run.job };
    if (run.job.status !== 'running') return paused(null);

    const prepared = prepareGeneration(plan, await deps.loadInputs(), deps.newId);
    if (!prepared.ok) return { status: 'not_sent', job: run.job, reason: prepared.reason };
    if (run.job.status !== 'running') return paused(null);

    const before = run;
    const attemptId = deps.newId();
    const started = startUnit(run, { attemptId, provider: deps.provider, model: deps.model });
    if (!started.ok) throw new Error(`無法開始單元：${started.reason}`);
    run = started.run;

    const outcome = await deps.execute({ prompt: prepared.prompt, signal: controller.signal });
    await deps.recordRunCheck(outcome.record);
    if (outcome.record.provider !== deps.provider || outcome.record.model !== deps.model) {
      throw new Error('執行紀錄的服務或模型與單元不符');
    }
    if (outcome.status === 'blocked') {
      if (run.active?.attemptId === attemptId) run = before;
      return { status: 'blocked', job: run.job, record: outcome.record, failure: null };
    }
    const attempt: Attempt = { attemptId, before, record: outcome.record };
    if (!outcome.result.ok) return fail(attempt, { kind: 'provider', error: outcome.result.error });

    const parsed = parseGenerationOutput(outcome.result.text);
    if (!parsed.ok) return fail(attempt, { kind: 'invalid_output', message: parsed.error });
    const converted = convertGeneration(parsed.output, {
      jobSnapshotId: plan.jobSnapshotId,
      claims: prepared.claims,
      profile: prepared.profile,
      newId: deps.newId,
      createdAt: new Date(deps.now()).toISOString(),
    });
    if (!converted.ok) return fail(attempt, { kind: 'invalid_output', message: converted.error });

    const completed = completeUnit(run, attemptId, converted.result);
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
