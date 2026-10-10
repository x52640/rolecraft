import { describe, expect, it } from 'vitest';

import type { Launch } from '../core/process.ts';
import { CLAUDE_RUN_COMMAND, CLAUDE_VERSION_COMMAND } from './constants.ts';
import {
  budgetLaunch,
  CLAUDE_REVERIFY_MAX_MODEL_CALLS,
  CLAUDE_REVERIFY_MODEL,
  ReverifyBudgetError,
} from './reverify.ts';
import { memoryStore, runDeps, versionedFake } from './reverify-fakes.ts';
import { createClaudeService } from './service.ts';
import type { ClaudeVersionRecord, ClaudeVersionStore } from './version-gate.ts';

/** P1-T039：呼叫上限、版本讀取與保存介面的保守處理。 */

const REQ = { model: 'haiku', prompt: 'x', trigger: 'run_start' } as const;
const NEW = '2.1.300';

const service = (store?: ClaudeVersionStore, locate = '/fake/versions/claude') =>
  createClaudeService({
    locate: () => Promise.resolve(locate),
    findManagedSettings: () => Promise.resolve([]),
    ...(store ? { store } : {}),
  });

describe('模型呼叫上限', () => {
  it('上限是 ≤ 5 的常數，用最便宜模型', () => {
    expect(CLAUDE_REVERIFY_MAX_MODEL_CALLS).toBeLessThanOrEqual(5);
    expect(CLAUDE_REVERIFY_MODEL).toBe('haiku');
  });

  it('超過上限的模型呼叫被拒絕、不啟動子程序；非模型指令不計', async () => {
    let launched = 0;
    const base: Launch = () => {
      launched += 1;
      return Promise.resolve({
        exitCode: 0,
        stdout: '',
        stderr: '',
        aborted: false,
        truncated: false,
      });
    };
    const counter = { modelCalls: 0 };
    const launch = budgetLaunch(base, counter);
    const run = { executablePath: '/fake/claude', command: CLAUDE_RUN_COMMAND, model: 'haiku' };
    for (let i = 0; i < CLAUDE_REVERIFY_MAX_MODEL_CALLS; i += 1) await launch(run);
    await launch({ executablePath: '/fake/claude', command: CLAUDE_VERSION_COMMAND });
    await expect(launch(run)).rejects.toBeInstanceOf(ReverifyBudgetError);
    expect(counter.modelCalls).toBe(CLAUDE_REVERIFY_MAX_MODEL_CALLS);
    expect(launched).toBe(CLAUDE_REVERIFY_MAX_MODEL_CALLS + 1);
  });
});

describe('版本讀不到或格式異常 → 不視為已驗證、不重新驗證', () => {
  it.each([
    ['結束碼非 0／空輸出', ''],
    ['非版本輸出', 'Claude Code\n'],
  ])('%s', async (_label, versionStdout) => {
    const fake = versionedFake({ version: NEW, versionStdout });
    const { store, saved } = memoryStore();
    const svc = service(store);
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.outcome.status).toBe('blocked');
    expect(fake.modelCalls()).toHaveLength(0);
    expect(res.version).toMatchObject({ status: 'blocked' });
    expect(saved).toEqual([]);
    expect(svc.gate.state.kind).toBe('ready');
  });

  it('init 回報的版本與 --version 不同 → 失敗停用', async () => {
    const fake = versionedFake({ version: NEW, versionStdout: '2.1.301 (Claude Code)\n' });
    const { store, saved } = memoryStore();
    const res = await service(store).run(REQ, runDeps(fake.spawn));
    expect(res.outcome.status).toBe('blocked');
    expect(saved.at(-1)).toMatchObject({ version: '2.1.301', outcome: 'failed' });
    expect(saved.at(-1)?.cases.find((c) => !c.passed)?.id).toBe('version-in-init');
  });

  it('找不到 CLI → 擋下、不重新驗證', async () => {
    const fake = versionedFake({ version: NEW });
    const svc = createClaudeService({
      locate: () => Promise.resolve(null),
      findManagedSettings: () => Promise.resolve([]),
      store: memoryStore().store,
    });
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.version).toMatchObject({ status: 'blocked' });
    expect(fake.calls()).toHaveLength(0);
  });
});

describe('保存介面', () => {
  it('沒有保存介面 → 只接受 ADR-0002 驗證版本，新版本不自動重新驗證', async () => {
    const fake = versionedFake({ version: NEW });
    const svc = service();
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.outcome.status).toBe('blocked');
    expect(res.outcome.record.items.executionMode.outcome).toBe('unknown');
    expect(fake.modelCalls()).toHaveLength(0);
  });

  it.each<[string, ClaudeVersionStore]>([
    ['讀取丟錯', { load: () => Promise.reject(new Error('io')), save: () => Promise.resolve() }],
    [
      '格式不合法',
      { load: () => Promise.resolve([{ version: NEW }] as never), save: () => Promise.resolve() },
    ],
  ])('%s → 不重新驗證、新版本不接受', async (_label, store) => {
    const fake = versionedFake({ version: NEW });
    const svc = service(store);
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.version).toMatchObject({ status: 'blocked' });
    expect(res.outcome.status).toBe('blocked');
    expect(fake.modelCalls()).toHaveLength(0);
  });

  it('保存失敗 → 視為失敗並停用', async () => {
    const fake = versionedFake({ version: NEW });
    const svc = service({
      load: () => Promise.resolve([]),
      save: () => Promise.reject(new Error('disk full')),
    });
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.version).toMatchObject({ status: 'blocked' });
    expect(svc.gate.isAccepted(NEW)).toBe(false);
    expect(svc.gate.state.kind).toBe('disabled');
    expect(res.outcome.status).toBe('blocked');
  });

  it('保存清單已有失敗紀錄 → 啟動即停用，不重跑（連驗證版本也不執行）', async () => {
    const failed: ClaudeVersionRecord = {
      version: NEW,
      outcome: 'failed',
      verifiedAt: '2026-10-09T00:00:00Z',
      cases: [{ id: 'no-tool-calls', passed: false, detail: 'x' }],
      modelCalls: 1,
      reason: 'no-tool-calls：x',
    };
    const fake = versionedFake({ version: '2.1.296' });
    const svc = service(memoryStore([failed]).store);
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.outcome.status).toBe('blocked');
    expect(res.outcome.record.items.cliConfig.basis).toContain('不自動重試');
    expect(fake.modelCalls()).toHaveLength(0);
  });
});
