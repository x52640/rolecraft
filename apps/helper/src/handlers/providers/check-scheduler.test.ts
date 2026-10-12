// P1-T070 審查屬實項：並行檢查結果、失敗後重試、等待上限（橋接逾時）、未選模型不檢查。
// 假 probe 計次：check 的每次呼叫與選項都記下；verifyModel 不得被呼叫（0 次模型呼叫）。
import { describe, expect, it, vi } from 'vitest';

import { createClaudeDraftEngine } from '../messages/claude-engine.ts';
import type { ClaudeCheck, ClaudeCheckOptions, ClaudeProbe } from './claude-probe.ts';
import type { ProvidersStore } from './persistence.ts';
import { createProvidersService } from './providers-service.ts';
import { CLAUDE_CHECKING_REASON, withUnavailableReason } from './unavailable-reason.ts';

const PASS: ClaudeCheck = {
  installed: 'passed',
  login: 'passed',
  eligibility: 'passed',
  subscriptionOnly: 'passed',
  isolation: 'passed',
  checkedAt: '2026-10-12T00:00:00.000Z',
};
/** 找得到 CLI，但確認不了版本（例如另一次檢查正在重新驗證，被閘門擋下） */
const VERSION_BLOCKED: ClaudeCheck = { ...PASS, isolation: 'failed' };
const LOGGED_OUT: ClaudeCheck = { ...PASS, login: 'failed', eligibility: 'unknown' };

function store(model: string | null): ProvidersStore {
  return {
    loadSelectedModel: () => model,
    saveSelectedModel: vi.fn(),
    saveConnection: vi.fn(),
    appendRunCheck: vi.fn(),
  };
}

interface Pending {
  readonly options: ClaudeCheckOptions | undefined;
  readonly resolve: (check: ClaudeCheck) => void;
}

/** 每次 check 都掛起，由測試決定結果與順序。 */
function setup(options: { selected?: string | null; waitMs?: number } = {}) {
  const pending: Pending[] = [];
  const check = vi.fn<ClaudeProbe['check']>(
    (opts) =>
      new Promise<ClaudeCheck>((resolve) => {
        pending.push({ options: opts, resolve });
      }),
  );
  const verifyModel = vi.fn<ClaudeProbe['verifyModel']>();
  const probe: ClaudeProbe = { candidates: ['haiku'], check, verifyModel };
  const selected = options.selected === undefined ? 'haiku' : options.selected;
  const providers = createProvidersService({
    claudeProbe: probe,
    store: store(selected),
    ...(options.waitMs !== undefined && { prepareRunWaitMs: options.waitMs }),
  });
  const resolve = createClaudeDraftEngine({ providers, candidates: ['haiku'] });
  /** 完整檢查（會照 D22／D24 重新驗證）的次數 */
  const fullChecks = () => check.mock.calls.filter(([o]) => o?.reverify !== false).length;
  return { pending, check, verifyModel, providers, resolve, fullChecks };
}

/** 等掛起的檢查數到 n */
async function waitPending(pending: readonly Pending[], n: number): Promise<void> {
  await vi.waitFor(() => {
    expect(pending.length).toBeGreaterThanOrEqual(n);
  });
}

describe('並行檢查：先開始的較晚結束', () => {
  it('較舊的完整檢查通過、較新的只是確認不了版本 → 採用通過的結果，原工作繼續', async () => {
    const { pending, providers, resolve, verifyModel } = setup();
    const run = resolve();
    await waitPending(pending, 1);
    // 使用者在設定頁按「重新檢查」：重新驗證進行中，被閘門擋下，先結束。
    const manual = providers.recheck('claude');
    await waitPending(pending, 2);
    pending[1]?.resolve(VERSION_BLOCKED);
    expect((await manual).state).toBe('unsupported');
    // 較早開始的檢查（重新驗證通過）較晚結束：不丟掉。
    pending[0]?.resolve(PASS);
    expect((await run)?.model).toBe('haiku');
    expect((await providers.status())[0]?.state).toBe('available');
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('較舊的結果沒通過：照舊丟棄，不蓋掉較新的狀態', async () => {
    const { pending, providers, resolve } = setup();
    const run = resolve();
    await waitPending(pending, 1);
    const manual = providers.recheck('claude');
    await waitPending(pending, 2);
    pending[1]?.resolve(PASS);
    await manual;
    pending[0]?.resolve(LOGGED_OUT);
    expect((await run)?.model).toBe('haiku');
    expect((await providers.status())[0]?.state).toBe('available');
  });
});

describe('完整檢查沒通過之後', () => {
  it('下次使用者發起的工作再檢查一次（不算檢查過）', async () => {
    const { pending, check, resolve, fullChecks, verifyModel } = setup();
    const first = resolve();
    await waitPending(pending, 1);
    pending[0]?.resolve(LOGGED_OUT);
    expect(await first).toBeNull();
    expect(withUnavailableReason('x')).toContain('尚未登入');

    const second = resolve();
    await waitPending(pending, 2);
    pending[1]?.resolve(PASS);
    expect((await second)?.model).toBe('haiku');
    expect(fullChecks()).toBe(2);

    // 可用之後不再檢查
    expect((await resolve())?.model).toBe('haiku');
    expect(check).toHaveBeenCalledTimes(2);
    expect(verifyModel).not.toHaveBeenCalled();
  });
});

describe('等待上限（橋接 30 秒逾時）', () => {
  it('檢查超過上限：回「檢查中」，檢查在背景繼續；下次發起接著等同一次', async () => {
    const { pending, check, providers, resolve, verifyModel } = setup({ waitMs: 5 });
    expect(await resolve()).toBeNull();
    expect(withUnavailableReason('x')).toBe(`沒有可用的 AI 服務：${CLAUDE_CHECKING_REASON}`);
    expect(check).toHaveBeenCalledTimes(1);

    // 期間讀狀態、再發起都不另外開檢查。
    await providers.status();
    expect(await resolve()).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);

    pending[0]?.resolve(PASS);
    await vi.waitFor(async () => {
      expect((await providers.status())[0]?.state).toBe('available');
    });
    expect((await resolve())?.model).toBe('haiku');
    expect(check).toHaveBeenCalledTimes(1);
    expect(verifyModel).not.toHaveBeenCalled();
  });
});

describe('沒有選定模型', () => {
  it('不做完整檢查（不重新驗證），直接回「尚未選定模型」', async () => {
    const { pending, resolve, fullChecks, verifyModel } = setup({ selected: null });
    const run = resolve();
    // 只有讀狀態的自動檢查（只讀版本）
    await waitPending(pending, 1);
    expect(pending[0]?.options).toEqual({ reverify: false });
    pending[0]?.resolve(VERSION_BLOCKED);
    expect(await run).toBeNull();
    expect(withUnavailableReason('x')).toBe('沒有可用的 AI 服務：尚未選定模型，請到設定頁選定模型');
    expect(fullChecks()).toBe(0);
    expect(verifyModel).not.toHaveBeenCalled();
  });
});
