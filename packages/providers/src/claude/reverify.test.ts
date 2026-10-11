import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { Launch, SpawnFn } from '../core/process.ts';
import {
  CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS,
  CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS,
  CLAUDE_VERSION_READ_TIMEOUT_MS,
  CLAUDE_RUN_COMMAND,
  CLAUDE_VERSION_COMMAND,
} from './constants.ts';
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

/** 假子程序：永遠不結束、忽略 SIGTERM，只有 SIGKILL 才以 exitCode null 結束。 */
/** closeOnKill=false：SIGKILL 後 close 也不來（逃出群組的孫行程握著 stdout）。 */
function hangingChild(signals: string[], closeOnKill = true): ChildProcess {
  const child = new EventEmitter() as ChildProcess & EventEmitter;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  Object.assign(child, {
    stdout,
    stderr,
    stdin: new PassThrough(),
    kill: (signal: string) => {
      signals.push(signal);
      if (signal === 'SIGKILL' && closeOnKill) {
        stdout.end();
        stderr.end();
        process.nextTick(() => child.emit('close', null));
      }
      return true;
    },
  });
  return child;
}

describe('重新驗證執行逾時', () => {
  it('子程序不結束 → 逾時終止行程群組、記為失敗並停用，不卡在重新驗證中', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fake = versionedFake({ version: NEW });
      const signals: string[] = [];
      let hung!: () => void;
      const started = new Promise<void>((r) => (hung = r));
      let spawned = 0;
      // 第 1 次是重新驗證前的版本讀取（正常回應），之後重新驗證的 launch 一律卡住。
      const spawn: SpawnFn = (file, args, options) => {
        spawned += 1;
        if (spawned === 1) return fake.spawn(file, args, options);
        hung();
        return hangingChild(signals);
      };
      const { store, saved } = memoryStore();
      const svc = service(store);
      const pending = svc.run(REQ, runDeps(spawn));
      await started;
      expect(svc.gate.state.kind).toBe('reverifying');
      await vi.advanceTimersByTimeAsync(CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS + 2000);
      const res = await pending;
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(res.version).toMatchObject({ status: 'blocked' });
      expect(res.outcome.status).toBe('blocked');
      expect(saved.at(-1)).toMatchObject({ version: NEW, outcome: 'failed', modelCalls: 0 });
      expect(saved.at(-1)?.reason).toContain('ReverifyTimeoutError');
      expect(svc.gate.state.kind).toBe('disabled');
      expect(spawned).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('SIGKILL 後 close 永遠不來 → 硬期限到就不再等，記為失敗並停用', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fake = versionedFake({ version: NEW });
      const signals: string[] = [];
      let hung!: () => void;
      const started = new Promise<void>((r) => (hung = r));
      let spawned = 0;
      const spawn: SpawnFn = (file, args, options) => {
        spawned += 1;
        if (spawned === 1) return fake.spawn(file, args, options);
        hung();
        return hangingChild(signals, false);
      };
      const { store, saved } = memoryStore();
      const svc = service(store);
      const pending = svc.run(REQ, runDeps(spawn));
      await started;
      await vi.advanceTimersByTimeAsync(
        CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS + CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS + 1000,
      );
      // 修正前：launch 只在 close 時結束，這裡永遠等不到（測試逾時）
      const res = await pending;
      expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(res.version).toMatchObject({ status: 'blocked' });
      expect(saved.at(-1)?.reason).toContain('ReverifyTimeoutError');
      expect(svc.gate.state.kind).toBe('disabled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('重新驗證前讀版本（--version）卡住 → 逾時視為讀不到版本，blocked、不重新驗證', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const signals: string[] = [];
      let hung!: () => void;
      const started = new Promise<void>((r) => (hung = r));
      const { store, saved } = memoryStore();
      const svc = service(store);
      const pending = svc.ensureVersion(
        runDeps(() => {
          hung();
          return hangingChild(signals, false);
        }),
      );
      await started;
      await vi.advanceTimersByTimeAsync(
        CLAUDE_VERSION_READ_TIMEOUT_MS + CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS + 1000,
      );
      // 修正前：--version 沒有逾時，這裡永遠等不到（測試逾時）
      expect(await pending).toMatchObject({ status: 'blocked', record: null });
      expect(saved).toEqual([]);
      expect(svc.gate.state.kind).not.toBe('reverifying');
    } finally {
      vi.useRealTimers();
    }
  });
});
