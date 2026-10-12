// P1-T070：helper 重開後不必手動重新檢查。第一次需要 Claude 狀態時自動做一次連線檢查（不呼叫模型）。
// 真實檢查路徑＋假 spawn（計次），不呼叫真實 CLI。
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { type ClaudeVersionRecord, createClaudeService, type RunDeps } from '@rolecraft/providers';
import { describe, expect, it, vi } from 'vitest';

import { createClaudeDraftEngine } from '../messages/claude-engine.ts';
import { HANDLERS } from '../registry.ts';
import type { ClaudeProbe } from './claude-probe.ts';
import type { ProvidersStore } from './persistence.ts';
import { createProvidersService } from './providers-service.ts';
import { withUnavailableReason } from './unavailable-reason.ts';

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../packages/providers/src/claude/fixtures',
);
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

function fakeCli(script: { version?: string; auth?: string } = {}) {
  const calls: (readonly string[])[] = [];
  const version = script.version ?? '2.1.296';
  const spawn: SpawnFn = (_file, args, options) => {
    calls.push(args);
    // 重新驗證的誘餌沙箱：auth status 要抓得到專案 apiKeyHelper（同 reverify-claude 測試）。
    const decoy = String(options.cwd).includes('rolecraft-claude-live-');
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    Object.assign(child, { stdout, stderr: new PassThrough(), stdin: new PassThrough() });
    Object.assign(child, { kill: () => true });
    const out =
      args[0] === '--version'
        ? `${version} (Claude Code)\n`
        : args[0] === 'auth'
          ? decoy
            ? fixture('auth-api-key-helper.json')
            : (script.auth ?? fixture('auth-subscription.json'))
          : fixture('run-ok.jsonl').replaceAll(
              '"claude_code_version":"2.1.296"',
              `"claude_code_version":"${version}"`,
            );
    setImmediate(() => {
      stdout.end(out);
      setImmediate(() => child.emit('close', 0));
    });
    return child;
  };
  return {
    spawn,
    calls,
    modelCalls: () => calls.filter((a) => a[0] === '-p').length,
    checkCalls: () => calls.filter((a) => a[0] === '--version' || a[0] === 'auth').length,
  };
}

/** 上次程序選定了 sonnet（資料區）。 */
function memoryProvidersStore(): ProvidersStore {
  return {
    loadSelectedModel: () => 'sonnet',
    saveSelectedModel: vi.fn(),
    saveConnection: vi.fn(),
    appendRunCheck: vi.fn(),
  };
}

/** 模擬 helper 重開：新的 Claude 服務與 providers 服務，資料區裡已有選定的模型。 */
function restarted(
  script: { version?: string; auth?: string } = {},
  versions: ClaudeVersionRecord[] = [],
) {
  const cli = fakeCli(script);
  const saved: ClaudeVersionRecord[] = [];
  const service = createClaudeService({
    locate: () => Promise.resolve('/fake/claude'),
    findManagedSettings: () => Promise.resolve([]),
    store: {
      load: () => Promise.resolve([...versions, ...saved]),
      save: (r) => {
        saved.push(r);
        return Promise.resolve();
      },
    },
  });
  const runDeps = { spawn: cli.spawn, parentEnv: { HOME: '/Users/owner' } };
  const providers = createProvidersService({ service, runDeps, store: memoryProvidersStore() });
  const resolve = createClaudeDraftEngine({ providers, runDeps });
  return { cli, providers, resolve, saved };
}

const signal = () => new AbortController().signal;

const record = (outcome: ClaudeVersionRecord['outcome']): ClaudeVersionRecord => ({
  version: '2.1.300',
  outcome,
  verifiedAt: '2026-10-09T00:00:00.000Z',
  cases: outcome === 'failed' ? [{ id: 'no-tool-calls', passed: false, detail: 'x' }] : [],
  modelCalls: 0,
  reason: outcome === 'failed' ? 'no-tool-calls：x' : '重新驗證未完成',
});

describe('重開後使用者直接發起 AI 工作（P1-T070）', () => {
  it('建立服務不啟動程式；發起生成先自動檢查一次再執行，檢查本身不呼叫模型', async () => {
    const { cli, resolve } = restarted();
    expect(cli.calls).toHaveLength(0);
    const engine = await resolve();
    expect(engine?.model).toBe('sonnet');
    expect(cli.modelCalls()).toBe(0);
    const checks = cli.checkCalls();
    expect(checks).toBeGreaterThan(0);

    const outcome = await engine?.execute({ prompt: '提示', signal: signal() });
    expect(outcome?.status).toBe('executed');
    expect(cli.modelCalls()).toBe(1);

    // 同一程序再發起：不再自動檢查（執行本身照舊每次做 R6）。
    const before = cli.calls.length;
    expect((await resolve())?.model).toBe('sonnet');
    expect(cli.calls).toHaveLength(before);
  });

  it('檢查不通過（未登入）：不提供執行端、0 次模型呼叫，狀態寫出原因', async () => {
    const { cli, providers, resolve } = restarted({ auth: fixture('auth-logged-out.json') });
    expect(await resolve()).toBeNull();
    expect(cli.modelCalls()).toBe(0);
    const [claude] = await providers.status();
    expect(claude?.state).toBe('not_logged_in');
    expect(claude?.login).toBe('failed');
  });

  it.each<[string, ClaudeVersionRecord[]]>([
    ['沒有紀錄的新版本', []],
    ['上次重新驗證被打斷', [record('incomplete')]],
  ])('%s：讀狀態不重新驗證；使用者發起工作照 D24 自動重跑，通過才執行', async (_n, versions) => {
    const { cli, providers, resolve, saved } = restarted({ version: '2.1.300' }, versions);
    // 設定頁讀狀態：只讀版本，不呼叫模型、不存紀錄。
    expect((await providers.status())[0]?.state).toBe('unsupported');
    expect(cli.modelCalls()).toBe(0);
    expect(saved).toHaveLength(0);

    // 使用者發起生成：自動檢查沒有擋掉 D24，重新驗證（先存暫定紀錄）通過後才給執行端。
    const engine = await resolve();
    expect(saved.map((r) => r.outcome)).toEqual(['incomplete', 'verified']);
    expect(cli.modelCalls()).toBeGreaterThan(0);
    expect(engine?.model).toBe('sonnet');
    const calls = cli.modelCalls();
    expect((await engine?.execute({ prompt: '提示', signal: signal() }))?.status).toBe('executed');
    expect(cli.modelCalls()).toBe(calls + 1);
  });

  it('目前版本停用：使用者發起工作不重試（0 次模型呼叫），回具體原因', async () => {
    const { cli, resolve, saved } = restarted({ version: '2.1.300' }, [record('failed')]);
    expect(await resolve()).toBeNull();
    expect(cli.modelCalls()).toBe(0);
    expect(saved).toHaveLength(0);
    expect(withUnavailableReason('固定文字')).toContain('已停用');
  });

  it('未登入時失敗訊息帶具體原因', async () => {
    const { resolve } = restarted({ auth: fixture('auth-logged-out.json') });
    expect(await resolve()).toBeNull();
    expect(withUnavailableReason('固定文字')).toBe(
      '沒有可用的 AI 服務：Claude Code 尚未登入，請用 Claude 訂閱帳號登入後再試',
    );
  });
});

describe('設定頁打開（providers.status）', () => {
  it('第一次讀狀態自動檢查一次；並行的讀取共用同一次；之後不再檢查', async () => {
    const { cli, providers } = restarted();
    const services = { providers };
    const [a, b] = await Promise.all([
      HANDLERS['providers.status']({}, services),
      HANDLERS['providers.status']({}, services),
    ]);
    expect(a).toEqual(b);
    expect(a.ok && a.services[0]?.state).toBe('available');
    // 一次檢查＝讀版本＋登入狀態；並行沒有多跑。
    const once = cli.checkCalls();
    await HANDLERS['providers.status']({}, services);
    expect(cli.checkCalls()).toBe(once);
    expect(cli.modelCalls()).toBe(0);
  });

  it('檢查本身丟錯：不算檢查過，下次讀狀態再試', async () => {
    let fail = true;
    const check = vi.fn<ClaudeProbe['check']>(() =>
      fail
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({
            installed: 'passed',
            login: 'passed',
            eligibility: 'passed',
            subscriptionOnly: 'passed',
            isolation: 'passed',
            checkedAt: '2026-10-12T00:00:00.000Z',
          }),
    );
    const verifyModel = vi.fn<ClaudeProbe['verifyModel']>();
    const probe: ClaudeProbe = { candidates: ['haiku'], check, verifyModel };
    const providers = createProvidersService({ claudeProbe: probe });
    expect((await providers.status())[0]?.state).toBe('eligibility_unknown');
    fail = false;
    expect((await providers.status())[0]?.state).toBe('available');
    await providers.status();
    expect(check).toHaveBeenCalledTimes(2);
    expect(verifyModel).not.toHaveBeenCalled();
  });

  it('選定模型前也先自動檢查（重開後直接按選定）', async () => {
    const { cli, providers } = restarted();
    const [haiku] = await providers.listCandidates('claude');
    expect(cli.calls).toHaveLength(0);
    const result = await providers.selectCandidate('claude', haiku?.candidateId ?? '');
    expect(result).toEqual({ kind: 'verified', verification: 'passed' });
    // 自動檢查不呼叫模型；選定的短驗證是一次。
    expect(cli.modelCalls()).toBe(1);
  });
});
