import { describe, expect, it } from 'vitest';

import { runWithSubscriptionCheck } from '../core/run-check.ts';
import { fixture } from './fake-spawn.ts';
import { makeInjectionSandbox } from './injection-sandbox.ts';
import { CLAUDE_REVERIFY_MAX_MODEL_CALLS } from './reverify.ts';
import { memoryStore, runDeps, versionedFake, withVersion } from './reverify-fakes.ts';
import { type ClaudeServiceOptions, createClaudeService } from './service.ts';
import type { ClaudeVersionRecord } from './version-gate.ts';

/** P1-T039：版本變更時自動重新驗證（假 spawn，不呼叫真實 CLI）。 */

const REQ = { model: 'haiku', prompt: '摘要這份職缺', trigger: 'run_start' } as const;
const NEW = '2.1.300';

const service = (options: ClaudeServiceOptions) =>
  createClaudeService({
    locate: () => Promise.resolve('/fake/versions/claude'),
    findManagedSettings: () => Promise.resolve([]),
    ...options,
  });

const verified = (version: string): ClaudeVersionRecord => ({
  version,
  outcome: 'verified',
  verifiedAt: '2026-10-09T00:00:00Z',
  cases: [],
  modelCalls: 2,
});

describe('版本相同或已驗證 → 不重跑', () => {
  it.each([
    ['ADR-0002 驗證版本', '2.1.296', []],
    ['保存清單中已驗證', NEW, [verified(NEW)]],
  ])('%s：直接執行，只有 1 次模型呼叫、不保存', async (_label, version, initial) => {
    const fake = versionedFake({ version });
    const { store, saved } = memoryStore(initial);
    const svc = service({ store });
    const { outcome, version: v } = await svc.run(REQ, runDeps(fake.spawn));
    expect(v).toEqual({ status: 'ready', version });
    expect(outcome.status === 'executed' && outcome.result.ok).toBe(true);
    expect(fake.modelCalls()).toHaveLength(1);
    expect(saved).toEqual([]);
  });
});

describe('版本不同', () => {
  it('全部通過 → 記為已驗證並執行；之後同版本不再重跑', async () => {
    const fake = versionedFake({ version: NEW });
    const { store, saved } = memoryStore();
    const svc = service({ store });
    const first = await svc.run(REQ, runDeps(fake.spawn));
    expect(first.version.status).toBe('reverified');
    if (first.version.status !== 'reverified') return;
    const record = first.version.record;
    expect(record).toMatchObject({ version: NEW, outcome: 'verified' });
    expect(record.verifiedAt).toBe('2026-10-10T00:00:00.000Z');
    expect(record.cases.every((c) => c.passed)).toBe(true);
    expect(record.cases.map((c) => c.id)).toEqual(
      expect.arrayContaining([
        'no-tool-calls',
        'no-decoy-read',
        'no-web',
        'no-user-settings',
        'api-key-source',
        'formal-run',
        'version-stable',
      ]),
    );
    expect(record.modelCalls).toBe(2);
    expect(record.modelCalls).toBeLessThanOrEqual(CLAUDE_REVERIFY_MAX_MODEL_CALLS);
    expect(fake.modelCalls().every((c) => c.args.includes('haiku'))).toBe(true);
    expect(saved).toEqual([record]);
    // 重新驗證後的一般執行：init 回報新版本也被串流守門接受
    expect(first.outcome.status === 'executed' && first.outcome.result.ok).toBe(true);
    expect(fake.modelCalls()).toHaveLength(3);

    const second = await svc.run(REQ, runDeps(fake.spawn));
    expect(second.version).toEqual({ status: 'ready', version: NEW });
    expect(fake.modelCalls()).toHaveLength(4);
    expect(saved).toHaveLength(1);
  });

  const toolUse = withVersion(fixture('run-tool-use.jsonl'), NEW);
  const okRun = withVersion(fixture('run-ok.jsonl'), NEW);
  const say = (text: string) => okRun.replace('"result":"', `"result":"${text} `);
  it.each([
    ['工具呼叫', { injection: toolUse }, 'no-tool-calls'],
    ['讀到誘餌檔', { injection: say('SECRET-DECOY-9921') }, 'no-decoy-read'],
    ['網頁擷取跡象', { injection: say('Example Domain') }, 'no-web'],
    ['載入 CLAUDE.md', { injection: say('CANARY-CWD-41') }, 'no-user-settings'],
    [
      'apiKeySource 不是 none',
      { injection: withVersion(fixture('run-init-api-key.jsonl'), NEW) },
      'api-key-source',
    ],
    [
      '額度拒絕（結果不確定）',
      { injection: withVersion(fixture('run-quota-rejected.jsonl'), NEW) },
      'injection-run',
    ],
    [
      '誘餌目錄 auth 沒抓到 apiKeyHelper',
      { decoyAuth: fixture('auth-subscription.json') },
      'auth-detects-helper',
    ],
    [
      '正式路徑 401',
      { formal: withVersion(fixture('run-is-error-401.jsonl'), NEW), formalExitCode: 1 },
      'formal-run',
    ],
  ])('%s → 停用、記錄原因、不重試', async (_label, extra, failedCase) => {
    const fake = versionedFake({ version: NEW, ...extra });
    const { store, saved } = memoryStore();
    const svc = service({ store });
    const first = await svc.run(REQ, runDeps(fake.spawn));
    expect(first.version.status).toBe('blocked');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ version: NEW, outcome: 'failed' });
    expect(saved[0]?.cases.find((c) => !c.passed)?.id).toBe(failedCase);
    expect(saved[0]?.modelCalls).toBeLessThanOrEqual(CLAUDE_REVERIFY_MAX_MODEL_CALLS);
    expect(svc.adapter.support.state).toBe('cannot_confirm');
    expect(first.outcome.status).toBe('blocked');
    expect(first.outcome.record.executed).toBe(false);
    expect(first.outcome.record.items.subscriptionLogin.basis).toContain('自動重新驗證失敗');
    const calls = fake.modelCalls().length;

    const again = await svc.run(REQ, runDeps(fake.spawn));
    expect(again.outcome.status).toBe('blocked');
    expect(fake.modelCalls()).toHaveLength(calls);
    expect(saved).toHaveLength(1);
  });

  it('hook／MCP 留下 marker → 停用', async () => {
    const fake = versionedFake({ version: NEW });
    const { store, saved } = memoryStore();
    const makeSandbox = async () => ({
      ...(await makeInjectionSandbox()),
      listMarkers: () => Promise.resolve(['hook-SessionStart']),
    });
    const svc = service({ store });
    await svc.run(REQ, { ...runDeps(fake.spawn), makeSandbox });
    expect(saved[0]?.cases.find((c) => !c.passed)?.id).toBe('no-user-settings');
    expect(svc.gate.state.kind).toBe('disabled');
  });
});

describe('互斥', () => {
  it('重新驗證中：一般執行（含直接走 core 的）與另一個重新驗證都被拒絕', async () => {
    const fake = versionedFake({ version: NEW });
    const { store } = memoryStore();
    const svc = service({ store });
    let release!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const reached = new Promise<void>((r) => (entered = r));
    const makeSandbox = async () => {
      entered();
      await paused;
      return makeInjectionSandbox();
    };
    const deps = { ...runDeps(fake.spawn), makeSandbox };
    const first = svc.run(REQ, deps);
    await reached;
    expect(svc.gate.state.kind).toBe('reverifying');

    const concurrent = await svc.run(REQ, deps);
    expect(concurrent.version).toMatchObject({ status: 'blocked' });
    expect(concurrent.outcome.status).toBe('blocked');
    expect(concurrent.outcome.record.items.cliConfig.basis).toContain('重新驗證');
    const direct = await runWithSubscriptionCheck(svc.adapter, REQ, runDeps(fake.spawn));
    expect(direct.status).toBe('blocked');
    expect(fake.modelCalls()).toHaveLength(0);

    release();
    expect((await first).version.status).toBe('reverified');
  });

  it('一般執行進行中：不開始重新驗證、不視為已驗證', async () => {
    const fake = versionedFake({ version: NEW });
    const { store, saved } = memoryStore();
    const svc = service({ store });
    await svc.gate.load();
    const done = svc.gate.enterRun();
    const res = await svc.ensureVersion(runDeps(fake.spawn));
    expect(res).toMatchObject({ status: 'blocked' });
    expect(svc.gate.isAccepted(NEW)).toBe(false);
    expect(saved).toEqual([]);
    done?.();
  });
});
