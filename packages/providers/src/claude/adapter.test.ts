import { RunCheckRecord } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { buildArgv } from '../core/command.ts';
import { checkConnection } from '../core/connection.ts';
import { type RunDeps, type RunRequest, runWithSubscriptionCheck } from '../core/run-check.ts';
import { type ClaudeAdapterOptions, createClaudeAdapter } from './adapter.ts';
import { CLAUDE_RUN_COMMAND } from './constants.ts';
import { type FakeClaudeScript, fakeClaude, fixture } from './fake-spawn.ts';
import { createClaudeStreamGuard } from './guard.ts';
import { verifyClaudeModel } from './models.ts';

const PARENT_ENV = {
  HOME: '/Users/owner',
  USER: 'owner',
  PATH: '/opt/homebrew/bin:/usr/bin',
  ANTHROPIC_API_KEY: 'sk-ant-secret',
  CLAUDE_CODE_PLUGIN_DIRS: '/Users/owner/.claude/mods/x',
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
  CLAUDE_CONFIG_DIR: '/tmp/empty',
};
const REQ: RunRequest = { model: 'haiku', prompt: '摘要這份職缺', trigger: 'run_start' };

function setup(script: FakeClaudeScript = {}, options: ClaudeAdapterOptions = {}) {
  const fake = fakeClaude(script);
  const adapter = createClaudeAdapter({
    locate: () => Promise.resolve('/fake/versions/claude'),
    findManagedSettings: () => Promise.resolve([]),
    ...options,
  });
  const deps: RunDeps = {
    parentEnv: PARENT_ENV,
    now: () => new Date('2026-10-10T00:00:00Z'),
    newId: () => 'run-1',
    spawn: createClaudeStreamGuard(fake.spawn),
  };
  const runs = () => fake.calls.filter((c) => c.args[0] === '-p');
  return { fake, adapter, deps, runs };
}

describe('Claude adapter：通過 R6 後執行', () => {
  it('固定命令列、提示走 stdin、環境只剩白名單', async () => {
    const { adapter, deps, runs, fake } = setup();
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status).toBe('executed');
    if (out.status !== 'executed') return;
    expect(out.result.ok).toBe(true);
    expect(RunCheckRecord.safeParse(out.record).success).toBe(true);
    expect(out.record.items.executionMode.basis).toContain('2.1.296');
    expect(out.record.removedEnvVarNames).toContain('ANTHROPIC_API_KEY');
    expect(adapter.lastCliVersion).toBe('2.1.296');
    expect(adapter.lastRun?.contextWindow).toBe(1000000);

    const [run] = runs();
    expect(run?.args).toEqual(buildArgv(CLAUDE_RUN_COMMAND, 'haiku'));
    expect(run?.stdin).toBe(REQ.prompt);
    expect(run?.args.join(' ')).not.toContain(REQ.prompt);
    // 每次呼叫（version、auth status、執行）的環境都一樣乾淨
    for (const call of fake.calls) {
      expect(call.env['PATH']).toBe('/usr/bin:/bin');
      expect(call.env['HOME']).toBe('/Users/owner');
      expect(Object.keys(call.env).filter((k) => /^(ANTHROPIC|CLAUDE)/.test(k))).toEqual([]);
    }
    expect(fake.calls.map((c) => c.args[0])).toEqual(['--version', 'auth', '-p']);
  });
});

describe('Claude adapter：執行前擋下（不呼叫模型）', () => {
  it('auth status 為 API key（apiKeyHelper）→ 擋下', async () => {
    const { adapter, deps, runs } = setup({
      auth: { stdout: fixture('auth-api-key-helper.json') },
    });
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.items.subscriptionLogin.outcome).toBe('failed');
    expect(out.record.items.cliConfig).toMatchObject({ outcome: 'failed' });
    expect(out.record.items.cliConfig.basis).toContain('apiKeyHelper');
    expect(runs()).toEqual([]);
  });

  it('未登入（結束碼 1、stdout 仍是 JSON）→ 擋下', async () => {
    const { adapter, deps, runs } = setup({
      auth: { stdout: fixture('auth-logged-out.json'), exitCode: 1 },
    });
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.items.subscriptionLogin.basis).toContain('未登入');
    expect(runs()).toEqual([]);
  });

  it('CLI 版本與 ADR-0002 驗證版本不同 → 相關項 unknown、提示重跑 spike', async () => {
    const { adapter, deps, runs } = setup({ version: { stdout: '2.1.300 (Claude Code)\n' } });
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status).toBe('blocked');
    expect(out.record.subscriptionOnly).toBe('unknown');
    expect(out.record.items.executionMode.outcome).toBe('unknown');
    expect(out.record.items.executionMode.basis).toContain('P1-T011');
    expect(out.record.items.cliConfig.outcome).toBe('unknown');
    expect(adapter.lastCliVersion).toBe('2.1.300');
    expect(runs()).toEqual([]);
  });

  it('auth status 輸出無法解析、版本取不到、找不到 CLI、受管設定存在 → unknown', async () => {
    const cases: [FakeClaudeScript, ClaudeAdapterOptions][] = [
      [{ auth: { stdout: 'not json' } }, {}],
      [{ version: { stdout: '', exitCode: 1 } }, {}],
      [{}, { locate: () => Promise.resolve(null) }],
      [{}, { findManagedSettings: () => Promise.resolve(['/Library/x/managed-settings.json']) }],
    ];
    for (const [script, options] of cases) {
      const { adapter, deps, runs } = setup(script, options);
      const out = await runWithSubscriptionCheck(adapter, REQ, deps);
      expect(out.status).toBe('blocked');
      expect(out.record.subscriptionOnly).toBe('unknown');
      expect(runs()).toEqual([]);
    }
  });
});

describe('Claude adapter：執行中檢查', () => {
  it('工具呼叫事件 → 串流守門立即終止、丟棄輸出', async () => {
    const { adapter, deps, fake } = setup({ run: { stdout: fixture('run-tool-use.jsonl') } });
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status).toBe('executed');
    if (out.status !== 'executed') return;
    expect(out.result.ok).toBe(false);
    if (!out.result.ok) expect(out.result.error.message).toContain('隔離檢查失敗');
    expect(fake.killed).toBe(true);
    // version 1 行＋auth 多行＋執行只送出 init 與 tool_use 兩行就被終止（錄製檔共 7 行）
    const authLines = fixture('auth-subscription.json').split(/(?<=\n)/).length;
    expect(fake.emittedLines).toBe(1 + authLines + 2);
  });

  it.each(['run-init-api-key.jsonl', 'run-init-tools.jsonl', 'run-version-mismatch.jsonl'])(
    '%s：init 異常 → 第一行就終止',
    async (name) => {
      const { adapter, deps, fake } = setup({ run: { stdout: fixture(name) } });
      const out = await runWithSubscriptionCheck(adapter, REQ, deps);
      expect(out.status === 'executed' && !out.result.ok).toBe(true);
      expect(fake.killed).toBe(true);
    },
  );

  it('額度拒絕 → quota_exhausted，只呼叫一次（不重試）', async () => {
    const { adapter, deps, runs } = setup({
      run: { stdout: fixture('run-quota-rejected.jsonl'), exitCode: 1 },
    });
    const out = await runWithSubscriptionCheck(adapter, REQ, deps);
    expect(out.status === 'executed' && !out.result.ok && out.result.error.kind).toBe(
      'quota_exhausted',
    );
    expect(runs()).toHaveLength(1);
  });

  it('沒接串流守門時，違規輸出仍會在結束後被丟棄', async () => {
    const { adapter, deps, fake } = setup({ run: { stdout: fixture('run-tool-use.jsonl') } });
    const out = await runWithSubscriptionCheck(adapter, REQ, { ...deps, spawn: fake.spawn });
    expect(fake.killed).toBe(false);
    expect(out.status === 'executed' && out.result.ok).toBe(false);
  });

  it('取消 → cancelled', async () => {
    const { adapter, deps } = setup();
    const controller = new AbortController();
    controller.abort();
    const out = await runWithSubscriptionCheck(
      adapter,
      { ...REQ, signal: controller.signal },
      deps,
    );
    expect(out.status === 'executed' && !out.result.ok && out.result.error.kind).toBe('cancelled');
  });
});

describe('安裝精靈與模型清單', () => {
  it('checkConnection：已登入、有方案；模型清單未知（CLI 沒有列模型的指令）', async () => {
    const { adapter, deps } = setup();
    const report = await checkConnection(adapter, { ...deps });
    expect(report.installation).toMatchObject({ installed: 'passed', version: '2.1.296' });
    expect(report.connection).toMatchObject({
      login: 'passed',
      eligibility: 'passed',
      availableModels: [],
      subscriptionOnly: 'passed',
    });
    expect(
      (await adapter.listModels({ launch: () => Promise.reject(new Error('x')) })).models,
    ).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
  });

  it('verifyClaudeModel：極短呼叫成功才算可用', async () => {
    const ok = setup();
    const good = await verifyClaudeModel(ok.adapter, 'haiku', ok.deps);
    expect(good).toMatchObject({ available: true, resolvedModel: 'claude-haiku-5-5', error: null });
    expect(good.record.executed).toBe(true);

    const bad = setup({ run: { stdout: fixture('run-is-error-401.jsonl'), exitCode: 1 } });
    expect((await verifyClaudeModel(bad.adapter, 'opus', bad.deps)).available).toBe(false);

    const blocked = setup({ auth: { stdout: fixture('auth-api-key-helper.json') } });
    const res = await verifyClaudeModel(blocked.adapter, 'sonnet', blocked.deps);
    expect(res).toMatchObject({ available: false });
    expect(res.record.executed).toBe(false);
  });
});
