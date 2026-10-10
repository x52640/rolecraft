import type { Provider } from '@rolecraft/contracts';

import { DEFAULT_RETRY_POLICY, retryDelayMs, type RetryPolicy } from './policy.ts';
import {
  firstPendingUnit,
  isCurrentAttempt,
  pause,
  reject,
  replaceUnit,
  type Transition,
  type WorkRun,
} from './state.ts';

export interface StartUnitInput {
  /** 呼叫端產生、每次送出都不同的嘗試識別碼 */
  readonly attemptId: string;
  readonly provider: Provider;
  readonly model: string;
}

/**
 * 送出第一個未完成單元。服務與模型記在單元上；同一單元重試中途不得切換，
 * 切換只發生在單元之間（暫停後續跑會清掉未完成單元的紀錄，可改用別的服務）。
 */
export function startUnit(run: WorkRun, input: StartUnitInput): Transition<{ unitId: string }> {
  if (run.job.status !== 'running') return reject('job_not_running');
  if (run.active !== null) return reject('attempt_in_flight');
  const unit = firstPendingUnit(run.job);
  if (unit === null) return reject('no_pending_unit');
  const switching =
    unit.provider !== null && (unit.provider !== input.provider || unit.model !== input.model);
  if (switching) return reject('provider_switch_mid_unit');
  const recorded = { ...unit, provider: input.provider, model: input.model };
  return {
    ok: true,
    unitId: unit.id,
    run: {
      job: replaceUnit(run.job, recorded),
      active: { unitId: unit.id, ...input },
    },
  };
}

/** 寫入的單元輸出，附上產生它的服務與模型。 */
export interface WrittenOutput<T> {
  readonly unitId: string;
  readonly output: T;
  readonly provider: Provider;
  readonly model: string;
}

/**
 * 單元完成並通過檢查（檢查由呼叫端在此之前完成）才寫入。
 * 不屬於目前嘗試的結果（取消後、暫停後才回來）一律丟棄，工作不變。
 */
export function completeUnit<T>(
  run: WorkRun,
  attemptId: string,
  output: T,
): Transition<{ written: WrittenOutput<T> }> {
  if (!isCurrentAttempt(run, attemptId)) return reject('stale_result');
  const { unitId, provider, model } = run.active;
  const unit = run.job.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) return reject('stale_result');
  const job = replaceUnit(run.job, { ...unit, status: 'completed' });
  const done = job.units.every((candidate) => candidate.status === 'completed');
  return {
    ok: true,
    written: { unitId, output, provider, model },
    run: { job: done ? { ...job, status: 'completed', pauseReason: null } : job, active: null },
  };
}

export type UnitError = 'quota_exhausted' | 'transient';

export interface FailUnitInput {
  readonly attemptId: string;
  readonly error: UnitError;
  /** 呼叫端注入的現在時間（epoch 毫秒），用來算下次重試時間 */
  readonly now: number;
  readonly policy?: RetryPolicy;
}

export type FailOutcome =
  | { readonly action: 'paused' }
  | { readonly action: 'retry'; readonly delayMs: number; readonly retryAt: number };

/**
 * 單元失敗；部分輸出一律丟棄。
 * - 額度錯誤：不重試，工作暫停（quota_exhausted）。
 * - 暫時性錯誤：未達上限就排重試（間隔逐次拉長）；用盡則暫停（retries_exhausted），
 *   等使用者主動續跑（D21），不自動續跑。
 */
export function failUnit(run: WorkRun, input: FailUnitInput): Transition<{ outcome: FailOutcome }> {
  if (!isCurrentAttempt(run, input.attemptId)) return reject('stale_result');
  if (input.error === 'quota_exhausted') {
    return { ok: true, outcome: { action: 'paused' }, run: pause(run, 'quota_exhausted') };
  }
  const policy = input.policy ?? DEFAULT_RETRY_POLICY;
  const unit = run.job.units.find((candidate) => candidate.id === run.active.unitId);
  if (unit === undefined) return reject('stale_result');
  if (unit.retryCount >= policy.maxTransientRetries) {
    return { ok: true, outcome: { action: 'paused' }, run: pause(run, 'retries_exhausted') };
  }
  const retryCount = unit.retryCount + 1;
  const delayMs = retryDelayMs(retryCount, policy);
  return {
    ok: true,
    outcome: { action: 'retry', delayMs, retryAt: input.now + delayMs },
    run: { job: replaceUnit(run.job, { ...unit, retryCount }), active: null },
  };
}

/** 使用者取消：停止目前單元並丟棄其輸出，已完成單元保留，工作暫停。 */
export function cancelJob(run: WorkRun): Transition {
  if (run.job.status !== 'running') return reject('job_not_running');
  return { ok: true, run: pause(run, 'user_cancelled') };
}

export interface ResumeInput {
  /** 續跑前已重做 R6 執行前檢查且通過 */
  readonly runCheckPassed: boolean;
}

/**
 * 使用者主動續跑（D21，本模組沒有任何自動續跑路徑）。從第一個未完成單元開始：
 * 清掉該單元的服務／模型紀錄與重試次數，讓使用者可在單元之間改用另一個服務。
 */
export function resumeJob(run: WorkRun, input: ResumeInput): Transition<{ nextUnitId: string }> {
  if (run.job.status !== 'paused') return reject('job_not_paused');
  if (!input.runCheckPassed) return reject('run_check_required');
  const unit = firstPendingUnit(run.job);
  if (unit === null) return reject('no_pending_unit');
  const reset = { ...unit, provider: null, model: null, retryCount: 0 };
  const job = replaceUnit(run.job, reset);
  return {
    ok: true,
    nextUnitId: unit.id,
    run: { job: { ...job, status: 'running', pauseReason: null }, active: null },
  };
}
