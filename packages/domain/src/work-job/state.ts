import type { PauseReason, Provider, WorkJob, WorkUnit } from '@rolecraft/contracts';

/**
 * 正在執行的一次嘗試。attemptId 由呼叫端產生（每次送出都不同），
 * 用來辨認「取消後才回來的結果」。只存在記憶體：輔助程式重開後一律沒有進行中的嘗試。
 */
export interface ActiveAttempt {
  readonly unitId: string;
  readonly attemptId: string;
  readonly provider: Provider;
  readonly model: string;
}

/** 執行期狀態：可持久化的 WorkJob（contracts）＋記憶體中的進行中嘗試。 */
export interface WorkRun {
  readonly job: WorkJob;
  readonly active: ActiveAttempt | null;
}

/** 轉換被拒的原因。 */
export type RejectReason =
  | 'job_not_running' // 工作不在執行中（已暫停或已完成）
  | 'job_not_paused' // 續跑只能從已暫停開始
  | 'attempt_in_flight' // 已有進行中的嘗試，不能再送出
  | 'no_pending_unit' // 沒有未完成單元
  | 'provider_switch_mid_unit' // 同一單元重試中途不得切換服務或模型
  | 'stale_result' // 結果不屬於目前的嘗試（例如取消後才回來），直接丟棄
  | 'run_check_required'; // 續跑前必須重做 R6 執行前檢查

export type Transition<T = object> =
  | ({ readonly ok: true; readonly run: WorkRun } & T)
  | { readonly ok: false; readonly reason: RejectReason };

export function reject(reason: RejectReason): { ok: false; reason: RejectReason } {
  return { ok: false, reason };
}

/** 建立新工作：所有單元未完成、尚未記錄服務與模型、狀態執行中。 */
export function createWorkRun(jobId: string, unitIds: readonly string[]): WorkRun {
  if (unitIds.length === 0) throw new RangeError('工作至少要有一個單元');
  if (new Set(unitIds).size !== unitIds.length) throw new RangeError('單元 id 不得重複');
  const units: WorkUnit[] = unitIds.map((id) => ({
    id,
    status: 'pending',
    provider: null,
    model: null,
    retryCount: 0,
  }));
  return { job: { id: jobId, status: 'running', units, pauseReason: null }, active: null };
}

/**
 * 輔助程式重開後從資料庫還原。進行中的嘗試已不存在：
 * 原本執行中的工作改為已暫停（interrupted），等使用者主動續跑（D21）。
 */
export function restoreWorkRun(job: WorkJob): WorkRun {
  if (job.status !== 'running') return { job, active: null };
  return { job: { ...job, status: 'paused', pauseReason: 'interrupted' }, active: null };
}

/** 第一個未完成單元；全部完成時回傳 null。 */
export function firstPendingUnit(job: WorkJob): WorkUnit | null {
  return job.units.find((unit) => unit.status === 'pending') ?? null;
}

/** 停止目前單元、丟棄其輸出、保留已完成單元，工作標記已暫停。 */
export function pause(run: WorkRun, reason: PauseReason): WorkRun {
  return { job: { ...run.job, status: 'paused', pauseReason: reason }, active: null };
}

export function replaceUnit(job: WorkJob, updated: WorkUnit): WorkJob {
  return { ...job, units: job.units.map((unit) => (unit.id === updated.id ? updated : unit)) };
}

/** 結果是否屬於目前進行中的嘗試；否則（取消後、暫停後、過期嘗試）一律丟棄。 */
export function isCurrentAttempt(
  run: WorkRun,
  attemptId: string,
): run is WorkRun & {
  active: ActiveAttempt;
} {
  return run.job.status === 'running' && run.active !== null && run.active.attemptId === attemptId;
}
