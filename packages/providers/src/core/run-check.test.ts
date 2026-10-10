import { RunCheckRecord, type RunCheckItems } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { createFakeAdapter } from '../fake/fake-adapter.ts';
import type { ProviderAdapter, SubscriptionRouteChecks } from './adapter.ts';
import { defineCommand } from './command.ts';
import {
  runWithSubscriptionCheck,
  type RunDeps,
  type RunRequest,
  summarizeChecks,
} from './run-check.ts';
import { createUnsupportedAdapter } from './unsupported.ts';

const deps: RunDeps = {
  parentEnv: {
    PATH: '/usr/bin',
    HOME: '/Users/me',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    openai_api_key: 'sk-openai-secret',
  },
  now: () => new Date('2026-10-10T00:00:00Z'),
  newId: () => 'run-1',
};
const req: RunRequest = { model: 'fake-model', prompt: '請改寫這段', trigger: 'run_start' };

describe('R6：全部通過才執行', () => {
  it('全部通過 → 執行，紀錄合法且只記變數名稱', async () => {
    const fake = createFakeAdapter({ script: [{ text: '改寫結果' }] });
    const out = await runWithSubscriptionCheck(fake, req, deps);
    expect(out.status).toBe('executed');
    if (out.status !== 'executed') return;
    expect(out.result).toEqual({ ok: true, text: '改寫結果' });
    expect(RunCheckRecord.safeParse(out.record).success).toBe(true);
    expect(out.record.subscriptionOnly).toBe('passed');
    expect(out.record.executed).toBe(true);
    expect(out.record.removedEnvVarNames).toEqual(['ANTHROPIC_API_KEY', 'openai_api_key']);
    expect(JSON.stringify(out.record)).not.toContain('secret');
    expect(fake.calls.prompts).toEqual(['請改寫這段']);
  });

  it.each(['run_start', 'queued_start', 'resume'] as const)(
    '時機 %s 都重新確認，不沿用上次結果',
    async (trigger) => {
      const fake = createFakeAdapter({ script: [{ text: 'a' }, { text: 'b' }] });
      await runWithSubscriptionCheck(fake, { ...req, trigger }, deps);
      const out = await runWithSubscriptionCheck(fake, { ...req, trigger }, deps);
      expect(fake.calls.routeChecks).toBe(2);
      expect(out.record.trigger).toBe(trigger);
    },
  );
});

describe('R6：任一項不成立就不執行', () => {
  const items: (keyof SubscriptionRouteChecks)[] = [
    'subscriptionLogin',
    'cliConfig',
    'executionMode',
  ];
  const cases = items.flatMap((key) =>
    (['failed', 'unknown'] as const).map((outcome) => [key, outcome] as const),
  );

  it.each(cases)('%s=%s → 不執行', async (key, outcome) => {
    const fake = createFakeAdapter({
      route: { [key]: { outcome, basis: '測試' } },
      script: [{ text: 'should not run' }],
    });
    const out = await runWithSubscriptionCheck(fake, req, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.executed).toBe(false);
    expect(out.record.subscriptionOnly).toBe(outcome);
    expect(out.record.items[key].outcome).toBe(outcome);
    expect(fake.calls.prompts).toEqual([]);
    expect(RunCheckRecord.safeParse(out.record).success).toBe(true);
  });

  it('確認過程丟錯 → 全部 unknown、不執行', async () => {
    const fake = createFakeAdapter({ routeThrows: true, script: [{ text: 'x' }] });
    const out = await runWithSubscriptionCheck(fake, req, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.subscriptionOnly).toBe('unknown');
    expect(fake.calls.prompts).toEqual([]);
  });

  it('環境清理不成立（適配器要放行 API key）→ 不執行', async () => {
    const fake = createFakeAdapter({ script: [{ text: 'x' }] });
    const bad: ProviderAdapter = { ...fake, environment: { allow: ['ANTHROPIC_API_KEY'] } };
    const out = await runWithSubscriptionCheck(bad, req, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.items.environmentSanitized.outcome).toBe('failed');
    expect(fake.calls.prompts).toEqual([]);
  });

  it('適配器宣稱通過但命令含 --bare → core 判 executionMode failed、不執行', async () => {
    const fake = createFakeAdapter({ script: [{ text: 'x' }] });
    const bad: ProviderAdapter = { ...fake, commands: [defineCommand(['-p', '--bare'])] };
    const out = await runWithSubscriptionCheck(bad, req, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.items.executionMode.outcome).toBe('failed');
    expect(fake.calls.prompts).toEqual([]);
  });

  it.each(['not_supported', 'cannot_confirm'] as const)('%s 的服務一律不執行', async (state) => {
    const adapter = createUnsupportedAdapter('antigravity', state, '尚未通過 R5 驗證');
    const out = await runWithSubscriptionCheck(adapter, req, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.subscriptionOnly).toBe('unknown');
    expect(out.record.items.subscriptionLogin.basis).toContain(
      state === 'not_supported' ? '尚未支援' : '無法確認',
    );
  });

  it('不合法模型 ID → 不執行', async () => {
    const fake = createFakeAdapter({ script: [{ text: 'x' }] });
    const out = await runWithSubscriptionCheck(fake, { ...req, model: '--bare' }, deps);
    expect(out.status).toBe('blocked');
    expect(fake.calls.prompts).toEqual([]);
  });
});

describe('R6：適配器回報格式不合法 → 執行前就擋（對抗驗證）', () => {
  const ok = { outcome: 'passed', basis: 'b' } as const;
  it.each([
    ['undefined', undefined],
    ['空物件', {}],
    ['缺項', { subscriptionLogin: ok }],
    [
      '空依據',
      { subscriptionLogin: ok, cliConfig: ok, executionMode: { outcome: 'passed', basis: '' } },
    ],
    ['多餘欄位', { subscriptionLogin: ok, cliConfig: ok, executionMode: ok, extra: ok }],
  ])('%s → execute 0 次、四項 unknown、紀錄合法', async (_name, route) => {
    const fake = createFakeAdapter({ script: [{ text: 'should not run' }] });
    let executed = 0;
    const bad: ProviderAdapter = {
      ...fake,
      verifySubscriptionRoute: () => Promise.resolve(route as unknown as SubscriptionRouteChecks),
      execute: () => {
        executed += 1;
        return Promise.resolve({ ok: true, text: 'x' });
      },
    };
    const out = await runWithSubscriptionCheck(bad, req, deps);
    expect(executed).toBe(0);
    expect(out.status).toBe('blocked');
    expect(out.record.executed).toBe(false);
    expect(out.record.subscriptionOnly).toBe('unknown');
    expect(Object.values(out.record.items)).toEqual(
      Array(4).fill({ outcome: 'unknown', basis: '適配器回報格式不合法' }),
    );
    expect(RunCheckRecord.safeParse(out.record).success).toBe(true);
  });

  it('summarizeChecks 逐一檢查四個固定 key，缺項不算通過', () => {
    const partial = { subscriptionLogin: ok } as unknown as RunCheckItems;
    expect(summarizeChecks(partial)).toBe('unknown');
    expect(
      summarizeChecks({
        subscriptionLogin: ok,
        environmentSanitized: ok,
        cliConfig: ok,
        executionMode: ok,
      }),
    ).toBe('passed');
  });
});

describe('RunCheckRecord schema 不變式', () => {
  const ok = { outcome: 'passed', basis: 'b' } as const;
  const base = {
    id: 'r',
    provider: 'claude',
    model: 'm',
    trigger: 'run_start',
    checkedAt: '2026-10-10T00:00:00Z',
    items: { subscriptionLogin: ok, environmentSanitized: ok, cliConfig: ok, executionMode: ok },
    removedEnvVarNames: [],
    subscriptionOnly: 'passed',
    executed: true,
  } as const;

  it('任一項未通過時總結不得為 passed', () => {
    const items = { ...base.items, cliConfig: { outcome: 'unknown', basis: 'b' } };
    expect(RunCheckRecord.safeParse({ ...base, items }).success).toBe(false);
  });

  it('總結未通過不得標記已執行', () => {
    const items = { ...base.items, cliConfig: { outcome: 'failed', basis: 'b' } };
    expect(RunCheckRecord.safeParse({ ...base, items, subscriptionOnly: 'failed' }).success).toBe(
      false,
    );
  });

  it('缺任何一項被拒', () => {
    const rest: Record<string, unknown> = { ...base.items };
    delete rest['cliConfig'];
    expect(RunCheckRecord.safeParse({ ...base, items: rest }).success).toBe(false);
  });
});

describe('fake adapter 錯誤路徑', () => {
  it('額度用完 → 回 quota_exhausted，不重試', async () => {
    const fake = createFakeAdapter({ script: [{ error: 'quota_exhausted' }, { text: 'later' }] });
    const out = await runWithSubscriptionCheck(fake, req, deps);
    expect(out.status).toBe('executed');
    if (out.status !== 'executed') return;
    expect(out.result.ok).toBe(false);
    if (out.result.ok) return;
    expect(out.result.error.kind).toBe('quota_exhausted');
    expect(fake.calls.prompts).toHaveLength(1);
  });

  it('暫時性錯誤與其他錯誤原樣分類', async () => {
    const fake = createFakeAdapter({ script: [{ error: 'transient' }, { error: 'other' }] });
    const a = await runWithSubscriptionCheck(fake, req, deps);
    const b = await runWithSubscriptionCheck(fake, req, deps);
    expect(a.status === 'executed' && !a.result.ok && a.result.error.kind).toBe('transient');
    expect(b.status === 'executed' && !b.result.ok && b.result.error.kind).toBe('other');
  });

  it('取消 → cancelled', async () => {
    const fake = createFakeAdapter({ script: [{ waitForCancel: true }] });
    const ac = new AbortController();
    const p = runWithSubscriptionCheck(fake, { ...req, signal: ac.signal }, deps);
    setTimeout(() => ac.abort(), 10);
    const out = await p;
    expect(out.status === 'executed' && !out.result.ok && out.result.error.kind).toBe('cancelled');
  });

  it('execute 丟錯 → other，紀錄仍保留', async () => {
    const fake = createFakeAdapter();
    const throwing: ProviderAdapter = { ...fake, execute: () => Promise.reject(new Error('boom')) };
    const out = await runWithSubscriptionCheck(throwing, req, deps);
    expect(out.status === 'executed' && !out.result.ok && out.result.error.kind).toBe('other');
  });
});
