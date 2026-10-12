import { describe, expect, it } from 'vitest';

import { memoryStore, runDeps, versionedFake } from './reverify-fakes.ts';
import { createClaudeService } from './service.ts';
import type { ClaudeVersionRecord } from './version-gate.ts';

/** P1-T070：observeVersion 只讀版本、不重新驗證（自動連線檢查用，0 次模型呼叫）。假 spawn。 */

const A = '2.1.300';

const service = (initial: ClaudeVersionRecord[] = []) => {
  const { store, saved } = memoryStore(initial);
  const svc = createClaudeService({
    locate: () => Promise.resolve('/fake/versions/claude'),
    findManagedSettings: () => Promise.resolve([]),
    store,
  });
  return { svc, saved };
};

const record = (outcome: ClaudeVersionRecord['outcome']): ClaudeVersionRecord => ({
  version: A,
  outcome,
  verifiedAt: '2026-10-11T00:00:00Z',
  cases: [],
  modelCalls: 0,
  reason: `${outcome} 原因`,
});

describe('observeVersion（P1-T070）', () => {
  it('已驗證版本 → ready', async () => {
    const cli = versionedFake({ version: A });
    const { svc } = service([record('verified')]);
    expect(await svc.observeVersion(runDeps(cli.spawn))).toEqual({ status: 'ready', version: A });
    expect(cli.modelCalls()).toHaveLength(0);
  });

  it.each([
    ['沒有紀錄', [] as ClaudeVersionRecord[]],
    ['未完成', [record('incomplete')]],
    ['停用', [record('failed')]],
  ])('%s → blocked，不存紀錄、0 次模型呼叫', async (_name, initial) => {
    const cli = versionedFake({ version: A });
    const { svc, saved } = service(initial);
    expect((await svc.observeVersion(runDeps(cli.spawn))).status).toBe('blocked');
    expect(saved).toHaveLength(0);
    expect(cli.modelCalls()).toHaveLength(0);
  });
});
