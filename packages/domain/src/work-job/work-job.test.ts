import { WorkJob } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import {
  cancelJob,
  completeUnit,
  createWorkRun,
  DEFAULT_RETRY_POLICY,
  failUnit,
  restoreWorkRun,
  resumeJob,
  retryDelayMs,
  startUnit,
  type Transition,
  type WorkRun,
} from './index.ts';

const NOW = Date.UTC(2026, 9, 10, 9, 0, 0);
const CLAUDE = { provider: 'claude', model: 'claude-model-a' } as const;
const CODEX = { provider: 'codex', model: 'codex-model-b' } as const;

function ok<T extends object>(result: Transition<T>): WorkRun & T {
  if (!result.ok) throw new Error(`轉換被拒：${result.reason}`);
  return { ...result, ...result.run };
}

/** 三個單元，u1 已完成，u2 正在以 attempt a2 執行。 */
function runningOnSecondUnit(): WorkRun {
  let run = createWorkRun('job-1', ['u1', 'u2', 'u3']);
  run = ok(startUnit(run, { attemptId: 'a1', ...CLAUDE }));
  run = ok(completeUnit(run, 'a1', 'out-1'));
  return ok(startUnit(run, { attemptId: 'a2', ...CLAUDE }));
}

const statuses = (run: WorkRun) => run.job.units.map((unit) => unit.status);

describe('S9-11 使用量耗盡與續跑（R9）', () => {
  it('使用量耗盡時停止並保留進度：工作暫停、顯示原因、不能再送出', () => {
    const r = ok(
      failUnit(runningOnSecondUnit(), { attemptId: 'a2', error: 'quota_exhausted', now: NOW }),
    );
    expect(r.outcome).toEqual({ action: 'paused' });
    expect(r.job.status).toBe('paused');
    expect(r.job.pauseReason).toBe('quota_exhausted');
    expect(statuses(r)).toEqual(['completed', 'pending', 'pending']);
    expect(startUnit(r, { attemptId: 'a3', ...CLAUDE })).toEqual({
      ok: false,
      reason: 'job_not_running',
    });
    expect(WorkJob.safeParse(r.job).success).toBe(true);
  });

  it('無密集重試：額度錯誤不重試；暫時性錯誤最多 2 次、間隔逐次拉長，用盡就暫停', () => {
    let run = runningOnSecondUnit();
    let attemptId = 'a2';
    const delays: number[] = [];
    for (let i = 1; i <= DEFAULT_RETRY_POLICY.maxTransientRetries; i += 1) {
      const r = ok(failUnit(run, { attemptId, error: 'transient', now: NOW }));
      if (r.outcome.action !== 'retry') throw new Error('應排重試');
      expect(r.outcome.retryAt).toBe(NOW + r.outcome.delayMs);
      delays.push(r.outcome.delayMs);
      attemptId = `t${i}`;
      run = ok(startUnit(r, { attemptId, ...CLAUDE }));
    }
    expect(delays).toEqual([retryDelayMs(1), retryDelayMs(2)]);
    expect(delays[1]).toBeGreaterThan(delays[0] ?? Infinity);

    const exhausted = ok(failUnit(run, { attemptId, error: 'transient', now: NOW }));
    expect(exhausted.outcome).toEqual({ action: 'paused' });
    expect(exhausted.job.pauseReason).toBe('retries_exhausted');

    const quota = ok(
      failUnit(runningOnSecondUnit(), { attemptId: 'a2', error: 'quota_exhausted', now: NOW }),
    );
    expect(quota.job.units[1]?.retryCount).toBe(0);
  });

  it('執行中單元的部分輸出被丟棄：暫停後該單元仍未完成，晚到的輸出不寫入', () => {
    const paused = ok(
      failUnit(runningOnSecondUnit(), { attemptId: 'a2', error: 'quota_exhausted', now: NOW }),
    );
    expect(paused.job.units[1]?.status).toBe('pending');
    expect(paused.active).toBeNull();
    expect(completeUnit(paused, 'a2', 'partial-2')).toEqual({ ok: false, reason: 'stale_result' });
  });

  it('已完成單元保留：暫停與續跑都不動已完成單元與其服務／模型紀錄', () => {
    const before = runningOnSecondUnit();
    const paused = ok(cancelJob(before));
    const resumed = ok(resumeJob(paused, { runCheckPassed: true }));
    for (const run of [paused, resumed]) {
      expect(run.job.units[0]).toEqual(before.job.units[0]);
      expect(run.job.units[0]).toMatchObject({ status: 'completed', ...CLAUDE });
    }
  });

  it('輔助程式重開後進度仍在：序列化還原後保留進度，執行中的工作改為暫停等使用者續跑', () => {
    const stored = JSON.stringify(runningOnSecondUnit().job);
    const restored = restoreWorkRun(WorkJob.parse(JSON.parse(stored)));
    expect(statuses(restored)).toEqual(['completed', 'pending', 'pending']);
    expect(restored.job.status).toBe('paused');
    expect(restored.job.pauseReason).toBe('interrupted');
    expect(restored.active).toBeNull();
    expect(WorkJob.safeParse(restored.job).success).toBe(true);
    expect(completeUnit(restored, 'a2', 'late')).toEqual({ ok: false, reason: 'stale_result' });
  });

  it('續跑從第一個未完成單元開始，續跑前必須重做 R6', () => {
    const paused = ok(cancelJob(runningOnSecondUnit()));
    expect(resumeJob(paused, { runCheckPassed: false })).toEqual({
      ok: false,
      reason: 'run_check_required',
    });
    const resumed = ok(resumeJob(paused, { runCheckPassed: true }));
    expect(resumed.nextUnitId).toBe('u2');
    expect(resumed.job).toMatchObject({ status: 'running', pauseReason: null });
    expect(ok(startUnit(resumed, { attemptId: 'a3', ...CLAUDE })).unitId).toBe('u2');
  });

  it('取消後才回來的結果被丟棄：即使已續跑，舊嘗試的結果與錯誤都不採用', () => {
    const cancelled = ok(cancelJob(runningOnSecondUnit()));
    expect(cancelled.job.pauseReason).toBe('user_cancelled');
    expect(completeUnit(cancelled, 'a2', 'late')).toEqual({ ok: false, reason: 'stale_result' });

    const resumed = ok(resumeJob(cancelled, { runCheckPassed: true }));
    const rerun = ok(startUnit(resumed, { attemptId: 'a3', ...CLAUDE }));
    expect(completeUnit(rerun, 'a2', 'late')).toEqual({ ok: false, reason: 'stale_result' });
    expect(failUnit(rerun, { attemptId: 'a2', error: 'quota_exhausted', now: NOW })).toEqual({
      ok: false,
      reason: 'stale_result',
    });
    const done = ok(completeUnit(rerun, 'a3', 'fresh'));
    expect(done.written).toEqual({ unitId: 'u2', output: 'fresh', ...CLAUDE });
  });

  it('使用者取消後不會自動重新送出：排定的重試被擋，只有使用者續跑能恢復', () => {
    const retrying = ok(
      failUnit(runningOnSecondUnit(), { attemptId: 'a2', error: 'transient', now: NOW }),
    );
    expect(retrying.outcome.action).toBe('retry');
    const cancelled = ok(cancelJob(retrying));
    // 排定的重試計時器到期後嘗試送出：被拒
    expect(startUnit(cancelled, { attemptId: 'a3', ...CLAUDE })).toEqual({
      ok: false,
      reason: 'job_not_running',
    });
    expect(cancelJob(cancelled)).toEqual({ ok: false, reason: 'job_not_running' });
    expect(ok(resumeJob(cancelled, { runCheckPassed: true })).job.status).toBe('running');
  });
});

describe('R9 服務與模型記錄', () => {
  it('每個單元記錄所用的服務與模型；重試中途不得切換', () => {
    const run = runningOnSecondUnit();
    expect(run.job.units[1]).toMatchObject(CLAUDE);
    const retrying = ok(failUnit(run, { attemptId: 'a2', error: 'transient', now: NOW }));
    expect(startUnit(retrying, { attemptId: 'a3', ...CODEX })).toEqual({
      ok: false,
      reason: 'provider_switch_mid_unit',
    });
  });

  it('暫停後可改用另一個服務，切換只發生在單元之間', () => {
    const paused = ok(
      failUnit(runningOnSecondUnit(), { attemptId: 'a2', error: 'quota_exhausted', now: NOW }),
    );
    let run: WorkRun = ok(
      startUnit(ok(resumeJob(paused, { runCheckPassed: true })), { attemptId: 'a3', ...CODEX }),
    );
    run = ok(completeUnit(run, 'a3', 'out-2'));
    run = ok(startUnit(run, { attemptId: 'a4', ...CODEX }));
    run = ok(completeUnit(run, 'a4', 'out-3'));
    expect(run.job.status).toBe('completed');
    expect(run.job.units.map((unit) => unit.provider)).toEqual(['claude', 'codex', 'codex']);
  });

  it('同時只能有一個進行中的嘗試；建立工作時拒絕空單元與重複 id', () => {
    expect(startUnit(runningOnSecondUnit(), { attemptId: 'x', ...CLAUDE })).toEqual({
      ok: false,
      reason: 'attempt_in_flight',
    });
    expect(() => createWorkRun('j', [])).toThrow(RangeError);
    expect(() => createWorkRun('j', ['a', 'a'])).toThrow(RangeError);
  });
});
