import { describe, expect, it } from 'vitest';

import type { SpawnFn } from '../core/process.ts';
import { fixture } from './fake-spawn.ts';
import { makeInjectionSandbox } from './injection-sandbox.ts';
import { memoryStore, runDeps, versionedFake, withVersion } from './reverify-fakes.ts';
import { createClaudeService } from './service.ts';
import type { ClaudeVersionRecord, ClaudeVersionStore } from './version-gate.ts';

/** P1-T062（D24）：失敗只綁版本、中斷不算失敗、使用者重新啟用（假 spawn，不呼叫真實 CLI）。 */

const REQ = { model: 'haiku', prompt: 'x', trigger: 'run_start' } as const;
const A = '2.1.300';
const B = '2.1.301';

const service = (store: ClaudeVersionStore) =>
  createClaudeService({
    locate: () => Promise.resolve('/fake/versions/claude'),
    findManagedSettings: () => Promise.resolve([]),
    store,
  });

const toolUse = (version: string) => withVersion(fixture('run-tool-use.jsonl'), version);

type Fake = ReturnType<typeof versionedFake>;

/** 可以中途換掉的假 CLI（模擬 CLI 自動更新成別的版本）。 */
function switchable(initial: Fake) {
  let current = initial;
  const all: Fake[] = [initial];
  const spawn: SpawnFn = (file, args, options) => current.spawn(file, args, options);
  return {
    spawn,
    use(next: Fake) {
      current = next;
      all.push(next);
    },
    modelCalls: () => all.reduce((n, f) => n + f.modelCalls().length, 0),
  };
}

const failedRecord = (version: string): ClaudeVersionRecord => ({
  version,
  outcome: 'failed',
  verifiedAt: '2026-10-09T00:00:00Z',
  cases: [{ id: 'no-tool-calls', passed: false, detail: 'x' }],
  modelCalls: 1,
  reason: 'no-tool-calls：x',
});

const incompleteRecord = (version: string): ClaudeVersionRecord => ({
  version,
  outcome: 'incomplete',
  verifiedAt: '2026-10-11T00:00:00Z',
  cases: [],
  modelCalls: 0,
  reason: '重新驗證未完成',
});

describe('失敗只綁版本', () => {
  it('A 版失敗 → 停用；換成 B 版 → 自動重新驗證一次；換回 A 版 → 仍停用、不呼叫模型', async () => {
    const cli = switchable(versionedFake({ version: A, injection: toolUse(A) }));
    const { store, saved } = memoryStore();
    const svc = service(store);
    const first = await svc.run(REQ, runDeps(cli.spawn));
    expect(first.version.status).toBe('blocked');
    expect(svc.gate.state).toMatchObject({ kind: 'disabled', version: A });
    expect(svc.adapter.support.state).toBe('cannot_confirm');

    cli.use(versionedFake({ version: B }));
    const before = cli.modelCalls();
    const onB = await svc.run(REQ, runDeps(cli.spawn));
    expect(onB.version.status).toBe('reverified');
    expect(onB.outcome.status).toBe('executed');
    // 重新驗證 2 次＋這次工作 1 次
    expect(cli.modelCalls() - before).toBe(3);
    expect(svc.adapter.support.state).toBe('supported');

    cli.use(versionedFake({ version: A }));
    const calls = cli.modelCalls();
    const records = saved.length;
    const backOnA = await svc.run(REQ, runDeps(cli.spawn));
    expect(backOnA.version.status).toBe('blocked');
    expect(backOnA.outcome.status).toBe('blocked');
    expect(svc.gate.state).toMatchObject({ kind: 'disabled', version: A });
    expect(cli.modelCalls()).toBe(calls);
    expect(saved).toHaveLength(records);
  });
});

describe('舊資料相容（P1-T058 格式）', () => {
  it('outcome=failed＋重新驗證未完成的暫定紀錄讀成未完成：不停用，使用者發起工作時重跑', async () => {
    const legacy: ClaudeVersionRecord = { ...incompleteRecord(A), outcome: 'failed' };
    const fake = versionedFake({ version: A });
    const svc = service(memoryStore([legacy]).store);
    await svc.gate.load();
    expect(svc.gate.statusOf(A).kind).toBe('incomplete');
    expect(fake.calls()).toHaveLength(0);
    const res = await svc.run(REQ, runDeps(fake.spawn));
    expect(res.version.status).toBe('reverified');
    expect(res.outcome.status).toBe('executed');
  });

  it('有案例的真正失敗紀錄不會被當成未完成', async () => {
    const svc = service(memoryStore([{ ...failedRecord(A), reason: '重新驗證未完成' }]).store);
    await svc.gate.load();
    expect(svc.gate.statusOf(A).kind).toBe('failed');
  });
});

describe('重新啟用（reverify）', () => {
  it('通過 → 可用；之後一般執行照常', async () => {
    const fake = versionedFake({ version: A });
    const { store, saved } = memoryStore([failedRecord(A)]);
    const svc = service(store);
    const res = await svc.reverify(runDeps(fake.spawn));
    expect(res.status).toBe('reverified');
    expect(fake.modelCalls()).toHaveLength(2);
    expect(saved.map((r) => r.outcome)).toEqual(['incomplete', 'verified']);
    expect(svc.gate.isAccepted(A)).toBe(true);
    const run = await svc.run(REQ, runDeps(fake.spawn));
    expect(run.version).toEqual({ status: 'ready', version: A });
    expect(run.outcome.status).toBe('executed');
  });

  it('不通過 → 仍停用、紀錄新增一筆失敗', async () => {
    const fake = versionedFake({ version: A, injection: toolUse(A) });
    const { store, saved } = memoryStore([failedRecord(A)]);
    const svc = service(store);
    const res = await svc.reverify(runDeps(fake.spawn));
    expect(res.status).toBe('blocked');
    expect(saved.map((r) => r.outcome)).toEqual(['incomplete', 'failed']);
    expect(svc.gate.state).toMatchObject({ kind: 'disabled', version: A });
    expect(svc.gate.isAccepted(A)).toBe(false);
  });

  it.each([
    ['ADR-0002 驗證版本', '2.1.296', []],
    ['沒有紀錄的版本', B, []],
    ['失敗的是別的版本', A, [failedRecord(B)]],
  ])('%s → not_needed，不呼叫模型、不寫紀錄', async (_label, version, initial) => {
    const fake = versionedFake({ version });
    const { store, saved } = memoryStore([...initial]);
    const res = await service(store).reverify(runDeps(fake.spawn));
    expect(res).toEqual({ status: 'not_needed', version });
    expect(fake.modelCalls()).toHaveLength(0);
    expect(saved).toEqual([]);
  });

  it('與一般執行互斥：有執行進行中 → 擋下、不寫紀錄；重新驗證中 → 一般執行與另一次重新啟用被拒', async () => {
    const fake = versionedFake({ version: A });
    const { store, saved } = memoryStore([failedRecord(A)]);
    const svc = service(store);
    await svc.gate.load();
    // 一般執行進行中（目前版本還沒讀過，閘門仍是 ready）
    const done = svc.gate.enterRun();
    expect(done).not.toBeNull();
    const busy = await svc.reverify(runDeps(fake.spawn));
    expect(busy).toMatchObject({ status: 'blocked' });
    expect(saved).toEqual([]);
    done?.();

    let release!: () => void;
    const paused = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const reached = new Promise<void>((r) => (entered = r));
    const makeSandbox = async () => {
      entered();
      await paused;
      return makeInjectionSandbox();
    };
    const pending = svc.reverify({ ...runDeps(fake.spawn), makeSandbox });
    await reached;
    expect(svc.gate.state.kind).toBe('reverifying');
    const run = await svc.run(REQ, runDeps(fake.spawn));
    expect(run.outcome.status).toBe('blocked');
    expect(await svc.reverify(runDeps(fake.spawn))).toMatchObject({ status: 'blocked' });
    expect(fake.modelCalls()).toHaveLength(0);
    release();
    expect((await pending).status).toBe('reverified');
  });

  it('R6 不通過（CLI 改走 API key）→ 不呼叫模型，仍停用', async () => {
    const fake = versionedFake({ version: A, auth: fixture('auth-api-key-helper.json') });
    const { store, saved } = memoryStore([failedRecord(A)]);
    const svc = service(store);
    const res = await svc.reverify(runDeps(fake.spawn));
    expect(res.status).toBe('blocked');
    expect(fake.modelCalls()).toHaveLength(0);
    expect(saved.at(-1)?.cases.find((c) => !c.passed)?.id).toBe('auth-subscription');
    expect(svc.gate.state.kind).toBe('disabled');
  });

  it('未完成的版本也可以手動重新啟用', async () => {
    const fake = versionedFake({ version: A });
    const res = await service(memoryStore([incompleteRecord(A)]).store).reverify(
      runDeps(fake.spawn),
    );
    expect(res.status).toBe('reverified');
  });

  it('保存清單讀不到 → 不重新驗證', async () => {
    const fake = versionedFake({ version: A });
    const store: ClaudeVersionStore = {
      load: () => Promise.reject(new Error('io')),
      save: () => Promise.resolve(),
    };
    const res = await service(store).reverify(runDeps(fake.spawn));
    expect(res.status).toBe('not_needed');
    expect(fake.modelCalls()).toHaveLength(0);
  });
});

describe('不在背景呼叫模型', () => {
  it('建立服務、讀保存清單、查 support 與狀態都不啟動任何子程序', async () => {
    const fake = versionedFake({ version: A });
    const svc = service(memoryStore([failedRecord(A), incompleteRecord(B)]).store);
    await svc.gate.load();
    expect(svc.adapter.support.state).toBe('supported');
    expect(svc.gate.state.kind).toBe('ready');
    expect(fake.calls()).toHaveLength(0);
  });
});
