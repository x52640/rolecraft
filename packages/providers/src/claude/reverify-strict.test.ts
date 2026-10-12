import { describe, expect, it } from 'vitest';

import { fixture } from './fake-spawn.ts';
import { CANARIES } from './injection-sandbox.ts';
import { evaluateInjectionRun } from './reverify-cases.ts';
import { memoryStore, runDeps, versionedFake } from './reverify-fakes.ts';
import { createClaudeService } from './service.ts';
import type { ClaudeVersionRecord, ClaudeVersionStore } from './version-gate.ts';

/** P1-T039 對抗驗證修正：使用者設定欄位嚴格檢查、呼叫模型前先寫暫定失敗紀錄。 */

const REQ = { model: 'haiku', prompt: 'x', trigger: 'run_start' } as const;
const NEW = '2.1.300';

const service = (store: ClaudeVersionStore) =>
  createClaudeService({
    locate: () => Promise.resolve('/fake/versions/claude'),
    findManagedSettings: () => Promise.resolve([]),
    store,
  });

const okLines = fixture('run-ok.jsonl').split('\n');
const initOf = () => JSON.parse(okLines[0] ?? '') as Record<string, unknown>;
const withInit = (init: Record<string, unknown>) =>
  [JSON.stringify(init), ...okLines.slice(1)].join('\n');
const evaluate = (stdout: string) =>
  evaluateInjectionRun({
    output: { exitCode: 0, stdout, stderr: '', aborted: false, truncated: false },
    version: '2.1.296',
    canariesFound: [],
    secretCanary: CANARIES.secret,
    markers: [],
  }).find((c) => c.id === 'no-user-settings');

describe('使用者設定：init 欄位嚴格檢查（只用於重新驗證）', () => {
  it('2.1.296 實錄 init（四個欄位都在）通過', () => {
    expect(evaluate(fixture('run-ok.jsonl'))?.passed).toBe(true);
  });

  it.each([
    ['缺 plugins', (i: Record<string, unknown>) => delete i['plugins']],
    ['缺 skills', (i: Record<string, unknown>) => delete i['skills']],
    ['缺 slash_commands', (i: Record<string, unknown>) => delete i['slash_commands']],
    ['缺 mcp_servers', (i: Record<string, unknown>) => delete i['mcp_servers']],
    ['plugins 不是陣列', (i: Record<string, unknown>) => (i['plugins'] = { a: 1 })],
    ['skills 形狀不認得', (i: Record<string, unknown>) => (i['skills'] = 'none')],
    ['外掛不是 builtin', (i: Record<string, unknown>) => (i['plugins'] = [{ path: '/x' }])],
    ['外掛項目格式不認得', (i: Record<string, unknown>) => (i['plugins'] = ['builtin'])],
  ])('%s → 失敗', (_label, mutate) => {
    const init = initOf();
    mutate(init);
    const result = evaluate(withInit(init));
    expect(result?.passed).toBe(false);
  });
});

describe('呼叫模型前先寫暫定紀錄', () => {
  it('保存一直丟錯 → 模型呼叫 0 次、停用；多次重啟仍 0 次', async () => {
    const fake = versionedFake({ version: NEW });
    const store: ClaudeVersionStore = {
      load: () => Promise.resolve([]),
      save: () => Promise.reject(new Error('disk full')),
    };
    for (let restart = 0; restart < 3; restart += 1) {
      const svc = service(store);
      const res = await svc.run(REQ, runDeps(fake.spawn));
      expect(res.version).toMatchObject({ status: 'blocked' });
      expect(res.outcome.status).toBe('blocked');
      expect(svc.gate.state.kind).toBe('disabled');
    }
    expect(fake.modelCalls()).toHaveLength(0);
  });

  it('重新驗證中途當掉 → 重啟讀到暫定紀錄：需要重新驗證、不自己呼叫模型；使用者發起工作才重跑一次（D24）', async () => {
    const fake = versionedFake({ version: NEW });
    const records: ClaudeVersionRecord[] = [];
    const store: ClaudeVersionStore = {
      load: () => Promise.resolve([...records]),
      save: (r) => {
        records.push(r);
        return Promise.resolve();
      },
    };
    let reached!: () => void;
    const hung = new Promise<void>((r) => (reached = r));
    // 模擬當掉：沙箱建立永遠不回來（程序在呼叫模型前後被殺都一樣，紀錄是暫定）
    const makeSandbox = () => {
      reached();
      return new Promise<never>(() => undefined);
    };
    void service(store).run(REQ, { ...runDeps(fake.spawn), makeSandbox });
    await hung;
    expect(records).toEqual([
      expect.objectContaining({ version: NEW, outcome: 'incomplete', reason: '重新驗證未完成' }),
    ]);

    const spawned = fake.calls().length;
    const restarted = service(store);
    expect(await restarted.gate.load()).toBe(true);
    expect(restarted.gate.statusOf(NEW).kind).toBe('incomplete');
    expect(restarted.adapter.support.state).toBe('supported');
    expect(fake.calls()).toHaveLength(spawned);
    expect(fake.modelCalls()).toHaveLength(0);

    const res = await restarted.run(REQ, runDeps(fake.spawn));
    expect(res.version.status).toBe('reverified');
    expect(res.outcome.status).toBe('executed');
    // 重新驗證 2 次＋這次工作 1 次
    expect(fake.modelCalls()).toHaveLength(3);
    expect(records.map((r) => r.outcome)).toEqual(['incomplete', 'incomplete', 'verified']);
  });

  it('同版本以最後一筆為準：暫定失敗之後的 verified 覆蓋', async () => {
    const fake = versionedFake({ version: NEW });
    const base = { version: NEW, verifiedAt: '2026-10-09T00:00:00Z', cases: [], modelCalls: 0 };
    const { store } = memoryStore([
      { ...base, outcome: 'failed', reason: '重新驗證未完成' },
      { ...base, outcome: 'verified', modelCalls: 2 },
    ]);
    const res = await service(store).run(REQ, runDeps(fake.spawn));
    expect(res.version).toEqual({ status: 'ready', version: NEW });
    expect(res.outcome.status).toBe('executed');
  });
});
