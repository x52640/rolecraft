// P1-T062（D24）：providers.reverify_claude 與設定頁狀態。假 spawn，不呼叫真實 CLI。
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { BRIDGE_SCHEMAS } from '@rolecraft/contracts';
import {
  type ClaudeVersionRecord,
  type ClaudeVersionStore,
  createClaudeService,
  type RunDeps,
} from '@rolecraft/providers';
import { describe, expect, it, vi } from 'vitest';

import { HANDLERS } from '../registry.ts';
import { type ClaudeCheck, type ClaudeProbe, redactPaths } from './claude-probe.ts';
import { REVERIFY_RUNNING_REASON } from './claude-reverify.ts';
import { createProvidersService } from './providers-service.ts';

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../packages/providers/src/claude/fixtures',
);
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

const V = '2.1.300';
const B = '2.1.301';
const withVersion = (jsonl: string, version = V) =>
  jsonl.replaceAll('"claude_code_version":"2.1.296"', `"claude_code_version":"${version}"`);

/**
 * 依工作目錄分流的假 CLI：誘餌沙箱回專案 apiKeyHelper 的 auth status（重新驗證要偵測得到）。
 * cli.version／cli.toolUse 可中途改（模擬 CLI 自動更新、新版本隔離失效）。
 */
function fakeCli(run?: string) {
  const calls: { args: readonly string[] }[] = [];
  const cli = { version: V, toolUse: false };
  const runOutput = () =>
    run ?? withVersion(fixture(cli.toolUse ? 'run-tool-use.jsonl' : 'run-ok.jsonl'), cli.version);
  const spawn: SpawnFn = (_file, args, options) => {
    calls.push({ args });
    const decoy = String(options.cwd).includes('rolecraft-claude-live-');
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    Object.assign(child, { stdout, stderr: new PassThrough(), stdin: new PassThrough() });
    Object.assign(child, { kill: () => true });
    const out =
      args[0] === '--version'
        ? `${cli.version} (Claude Code)\n`
        : args[0] === 'auth'
          ? fixture(decoy ? 'auth-api-key-helper.json' : 'auth-subscription.json')
          : runOutput();
    setImmediate(() => {
      stdout.end(out);
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  };
  return {
    cli,
    spawn,
    modelCalls: () => calls.filter((c) => c.args[0] === '-p').length,
    calls,
  };
}

function memoryStore(initial: ClaudeVersionRecord[]) {
  const saved: ClaudeVersionRecord[] = [];
  const store: ClaudeVersionStore = {
    load: () => Promise.resolve([...initial, ...saved]),
    save: (r) => {
      saved.push(r);
      return Promise.resolve();
    },
  };
  return { store, saved };
}

const failed: ClaudeVersionRecord = {
  version: V,
  outcome: 'failed',
  verifiedAt: '2026-10-09T00:00:00.000Z',
  cases: [{ id: 'no-tool-calls', passed: false, detail: 'x' }],
  modelCalls: 1,
  reason: 'no-tool-calls：x',
};

function setup(initial: ClaudeVersionRecord[], run?: string) {
  const cli = fakeCli(run);
  const { store, saved } = memoryStore(initial);
  const service = createClaudeService({
    locate: () => Promise.resolve('/fake/claude'),
    findManagedSettings: () => Promise.resolve([]),
    store,
  });
  const providers = createProvidersService({
    service,
    runDeps: { spawn: cli.spawn, parentEnv: { HOME: '/Users/owner' } },
  });
  return { cli, saved, providers, service };
}

describe('Claude 停用時的狀態與重新啟用（真實檢查路徑＋假 spawn）', () => {
  it('建立服務不啟動任何程式；第一次查狀態自動檢查（只讀版本與登入，不呼叫模型），之後不再啟動', async () => {
    const { cli, providers } = setup([failed]);
    expect(cli.calls).toHaveLength(0);
    const [claude] = await providers.status();
    expect(claude?.state).toBe('unsupported');
    expect(cli.calls.every((c) => c.args[0] === '--version' || c.args[0] === 'auth')).toBe(true);
    expect(cli.modelCalls()).toBe(0);
    const before = cli.calls.length;
    await providers.status();
    expect(cli.calls).toHaveLength(before);
  });

  it('重新檢查：目前版本失敗 → 尚未支援＋原因，不呼叫模型；重新啟用通過 → 可用', async () => {
    const { cli, saved, providers } = setup([failed]);
    const checked = await providers.recheck('claude');
    expect(checked.state).toBe('unsupported');
    expect(checked.versionCheck).toMatchObject({ state: 'failed' });
    expect(checked.versionCheck?.reason).toContain('重新驗證失敗');
    expect(cli.modelCalls()).toBe(0);

    const res = await providers.reverifyClaude();
    expect(res.started).toBe(true);
    expect(res.status.versionCheck).toEqual({ state: 'running', reason: REVERIFY_RUNNING_REASON });
    expect((await providers.reverifyClaude()).started).toBe(false);
    await providers.reverifyTask;

    const [after] = await providers.status();
    expect(after).toMatchObject({ state: 'available', versionCheck: null });
    expect(after?.lastReverify).toMatchObject({ outcome: 'passed', reason: null });
    expect(saved.map((r) => r.outcome)).toEqual(['incomplete', 'verified']);
    expect(cli.modelCalls()).toBe(2);
  });

  it('重新啟用不通過 → 仍停用、新增一筆失敗紀錄', async () => {
    const { saved, providers } = setup([failed], withVersion(fixture('run-tool-use.jsonl')));
    await providers.reverifyClaude();
    await providers.reverifyTask;
    const [after] = await providers.status();
    expect(after?.state).toBe('unsupported');
    expect(after?.versionCheck).toMatchObject({ state: 'failed' });
    expect(after?.lastReverify).toMatchObject({ outcome: 'failed' });
    expect(saved.map((r) => r.outcome)).toEqual(['incomplete', 'failed']);
  });

  it('目前版本已驗證 → not_needed，不呼叫模型、不重新檢查', async () => {
    const { cli, saved, providers } = setup([{ ...failed, outcome: 'verified', cases: [] }]);
    await providers.reverifyClaude();
    await providers.reverifyTask;
    const [after] = await providers.status();
    expect(after?.lastReverify).toMatchObject({ outcome: 'not_needed' });
    expect(cli.modelCalls()).toBe(0);
    expect(saved).toEqual([]);
  });

  it('回應符合橋接 schema', async () => {
    const { providers } = setup([failed]);
    const response = await HANDLERS['providers.reverify_claude']({}, { providers });
    expect(BRIDGE_SCHEMAS['providers.reverify_claude'].response.safeParse(response).success).toBe(
      true,
    );
    await providers.reverifyTask;
    const status = await HANDLERS['providers.status']({}, { providers });
    expect(BRIDGE_SCHEMAS['providers.status'].response.safeParse(status).success).toBe(true);
  });
});

describe('背景重新啟用（替換的 probe）', () => {
  const OK: ClaudeCheck = {
    installed: 'passed',
    login: 'passed',
    eligibility: 'passed',
    subscriptionOnly: 'passed',
    isolation: 'passed',
    checkedAt: '2026-10-10T00:00:00.000Z',
  };

  it('blocked（例如有其他執行進行中）→ 不重新檢查，保留原本的原因', async () => {
    const probe = {
      candidates: ['haiku'],
      check: vi.fn(() =>
        Promise.resolve({
          ...OK,
          isolation: 'failed' as const,
          versionIssue: { state: 'failed' as const, reason: '停用原因' },
        }),
      ),
      verifyModel: vi.fn<ClaudeProbe['verifyModel']>(),
      reverify: vi.fn<NonNullable<ClaudeProbe['reverify']>>(() =>
        Promise.resolve({ outcome: 'blocked', reason: '有其他 Claude 執行進行中' }),
      ),
    } satisfies ClaudeProbe;
    const providers = createProvidersService({ claudeProbe: probe });
    await providers.recheck('claude');
    await providers.reverifyClaude();
    await providers.reverifyTask;
    const [after] = await providers.status();
    expect(probe.check).toHaveBeenCalledTimes(1);
    expect(after?.versionCheck).toEqual({ state: 'failed', reason: '停用原因' });
    expect(after?.lastReverify).toMatchObject({ outcome: 'blocked' });
  });

  it('原因不帶路徑', () => {
    expect(redactPaths('Error: spawn /Users/owner/.local/bin/claude ENOENT')).toBe(
      'Error: spawn 〔路徑〕 ENOENT',
    );
    expect(redactPaths('Claude CLI 2.1.300 重新驗證失敗（2026-10-09T00:00:00Z）')).toBe(
      'Claude CLI 2.1.300 重新驗證失敗（2026-10-09T00:00:00Z）',
    );
  });
});

describe('對抗驗證與 codex review 修正（P1-T062）', () => {
  const verifiedB: ClaudeVersionRecord = { ...failed, version: B, outcome: 'verified', cases: [] };

  it('A 版停用後 CLI 換成已驗證的 B：重新檢查讀到 B、恢復可用', async () => {
    const { cli, providers } = setup([failed, verifiedB]);
    expect((await providers.recheck('claude')).versionCheck).toMatchObject({ state: 'failed' });
    cli.cli.version = B;
    const after = await providers.recheck('claude');
    expect(after.state).toBe('available');
    expect(after.versionCheck).toBeNull();
    expect(cli.modelCalls()).toBe(0);
  });

  it('重新啟用回「不需要」（CLI 已換成已驗證版本）：狀態即時更新，不留舊的停用', async () => {
    const { cli, providers } = setup([failed, verifiedB]);
    await providers.recheck('claude');
    cli.cli.version = B;
    await providers.reverifyClaude();
    await providers.reverifyTask;
    const [after] = await providers.status();
    expect(after?.lastReverify).toMatchObject({ outcome: 'not_needed' });
    expect(after?.versionCheck).toBeNull();
    // 不直接當可用：要重新檢查
    expect(after?.state).toBe('eligibility_unknown');
    expect(cli.modelCalls()).toBe(0);
  });

  it('生成路徑的自動重新驗證停用了新版本：狀態查詢即時顯示停用與重新啟用', async () => {
    const { cli, providers, service } = setup([]);
    cli.cli.version = '2.1.296';
    expect((await providers.recheck('claude')).state).toBe('available');
    cli.cli.version = B;
    cli.cli.toolUse = true;
    const res = await service.run(
      { model: 'haiku', prompt: 'x', trigger: 'run_start' },
      {
        spawn: cli.spawn,
        parentEnv: { HOME: '/Users/owner' },
        now: () => new Date(),
        newId: () => 'r',
      },
    );
    expect(res.version.status).toBe('blocked');
    const [after] = await providers.status();
    expect(after?.versionCheck).toMatchObject({ state: 'failed' });
    expect(after?.state).toBe('unsupported');
  });
});
