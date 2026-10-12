// P1-T070 修正 cde0ddb 的審查待修：手動檢查中共用、額度用完的指示、rescue 只限版本問題。
// 假 probe 計次：check 的每次呼叫都記下；verifyModel 不得被呼叫（0 次模型呼叫）。
import { describe, expect, it, vi } from 'vitest';

import { createClaudeDraftEngine } from '../messages/claude-engine.ts';
import { createClaudeCheckScheduler } from './check-scheduler.ts';
import type { ClaudeCheck, ClaudeProbe } from './claude-probe.ts';
import type { ProvidersStore } from './persistence.ts';
import { createProvidersService } from './providers-service.ts';
import type { ServiceStatus } from './service.ts';
import { claudeState, initialStatus } from './state.ts';
import {
  CLAUDE_CHECKING_REASON,
  claudeUnavailableReason,
  withUnavailableReason,
} from './unavailable-reason.ts';

const PASS: ClaudeCheck = {
  installed: 'passed',
  login: 'passed',
  eligibility: 'passed',
  subscriptionOnly: 'passed',
  isolation: 'passed',
  checkedAt: '2026-10-12T00:00:00.000Z',
};
/** 純版本問題：找得到 CLI，登入與訂閱路線沒有確定失敗，只是確認不了版本 */
const VERSION_ONLY: ClaudeCheck = { ...PASS, isolation: 'failed' };
/** 版本確認不了，同時確定已登出 */
const VERSION_AND_LOGGED_OUT: ClaudeCheck = {
  ...VERSION_ONLY,
  login: 'failed',
  eligibility: 'unknown',
};
/** 版本確認不了，同時確定改走 API key（訂閱路線不成立） */
const VERSION_AND_API_KEY: ClaudeCheck = { ...VERSION_ONLY, subscriptionOnly: 'failed' };

function store(model: string | null): ProvidersStore {
  return {
    loadSelectedModel: () => model,
    saveSelectedModel: vi.fn(),
    saveConnection: vi.fn(),
    appendRunCheck: vi.fn(),
  };
}

/** 每次 check 都掛起，由測試決定結果與順序。 */
function hangingProbe() {
  const pending: ((check: ClaudeCheck) => void)[] = [];
  const check = vi.fn<ClaudeProbe['check']>(
    () =>
      new Promise<ClaudeCheck>((resolve) => {
        pending.push(resolve);
      }),
  );
  const verifyModel = vi.fn<ClaudeProbe['verifyModel']>();
  const probe: ClaudeProbe = { candidates: ['haiku'], check, verifyModel };
  return { pending, check, verifyModel, probe };
}

async function waitPending(pending: readonly unknown[], n: number): Promise<void> {
  await vi.waitFor(() => {
    expect(pending.length).toBeGreaterThanOrEqual(n);
  });
}

describe('手動「重新檢查」進行中發起工作', () => {
  it('共用手動那次檢查，不另開一次（不會被閘門擋成「請按重新檢查」）', async () => {
    const { pending, check, verifyModel, probe } = hangingProbe();
    const providers = createProvidersService({ claudeProbe: probe, store: store('haiku') });
    const resolve = createClaudeDraftEngine({ providers, candidates: ['haiku'] });
    const manual = providers.recheck('claude');
    await waitPending(pending, 1);
    const run = resolve();
    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);
    pending[0]?.(PASS);
    expect((await manual).state).toBe('available');
    expect((await run)?.model).toBe('haiku');
    expect(check).toHaveBeenCalledTimes(1);
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('手動那次超過等待上限：回「檢查中」，不另開檢查', async () => {
    const { pending, check, verifyModel, probe } = hangingProbe();
    const providers = createProvidersService({
      claudeProbe: probe,
      store: store('haiku'),
      prepareRunWaitMs: 5,
    });
    const resolve = createClaudeDraftEngine({ providers, candidates: ['haiku'] });
    const manual = providers.recheck('claude');
    await waitPending(pending, 1);
    expect(await resolve()).toBeNull();
    expect(withUnavailableReason('x')).toBe(`沒有可用的 AI 服務：${CLAUDE_CHECKING_REASON}`);
    expect(check).toHaveBeenCalledTimes(1);
    pending[0]?.(PASS);
    await manual;
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('發起的工作在檢查中時按「重新檢查」：共用同一次', async () => {
    const { pending, check, probe } = hangingProbe();
    const providers = createProvidersService({ claudeProbe: probe, store: store('haiku') });
    const resolve = createClaudeDraftEngine({ providers, candidates: ['haiku'] });
    const run = resolve();
    await waitPending(pending, 1);
    const manual = providers.recheck('claude');
    pending[0]?.(PASS);
    expect((await manual).state).toBe('available');
    expect((await run)?.model).toBe('haiku');
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('額度用完（R9）', () => {
  it('訊息指示額度恢復後到設定頁按「重新檢查」', () => {
    const status: ServiceStatus = { ...initialStatus('claude'), state: 'quota_exhausted' };
    expect(claudeUnavailableReason(status)).toBe(
      'Claude 訂閱額度已用完；額度恢復後請到設定頁按「重新檢查」',
    );
  });

  it('發起工作不重新檢查（行為不變）', async () => {
    const check = vi.fn<ClaudeProbe['check']>(() => Promise.resolve(PASS));
    let status: ServiceStatus = initialStatus('claude');
    const scheduler = createClaudeCheckScheduler(
      { check },
      (c) => (status = { ...status, state: claudeState(c, true) }),
      () => status,
    );
    expect(await scheduler.prepareRun()).toBe(true);
    expect(status.state).toBe('quota_exhausted');
    expect(await scheduler.prepareRun()).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('先開始的檢查較晚結束（rescue 只限純版本問題）', () => {
  function twoChecks() {
    const { pending, check, probe } = hangingProbe();
    let status: ServiceStatus = initialStatus('claude');
    const scheduler = createClaudeCheckScheduler(
      probe,
      (c) => (status = { ...status, state: claudeState(c, false) }),
      () => status,
    );
    const older = scheduler.refresh();
    const newer = scheduler.refresh();
    return { pending, check, older, newer, state: () => status.state };
  }

  it('較新的只是版本問題：採用較舊的通過結果', async () => {
    const { pending, older, newer, state } = twoChecks();
    await waitPending(pending, 2);
    pending[1]?.(VERSION_ONLY);
    await newer;
    pending[0]?.(PASS);
    await older;
    expect(state()).toBe('available');
  });

  it.each([
    ['確定已登出', VERSION_AND_LOGGED_OUT],
    ['確定改走 API key', VERSION_AND_API_KEY],
    ['方案確定不符', { ...VERSION_ONLY, eligibility: 'failed' } satisfies ClaudeCheck],
  ])('較新的同時%s：保留較新的結果，不被舊的通過蓋成可用', async (_name, newerCheck) => {
    const { pending, check, older, newer, state } = twoChecks();
    await waitPending(pending, 2);
    pending[1]?.(newerCheck);
    await newer;
    pending[0]?.(PASS);
    await older;
    expect(state()).not.toBe('available');
    expect(check).toHaveBeenCalledTimes(2);
  });
});
