// P1-T058：providers 服務的資料區保存（同一資料庫開兩次模擬重啟）。不呼叫任何真實 CLI。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { RunCheckRecord } from '@rolecraft/contracts';
import { createRepositories, openDatabase } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaudeCheck, ClaudeModelCheck, ClaudeProbe } from './claude-probe.ts';
import { createProvidersStore, type ProvidersStore } from './persistence.ts';
import { createProvidersService } from './providers-service.ts';

const OK_CHECK: ClaudeCheck = {
  installed: 'passed',
  login: 'passed',
  eligibility: 'passed',
  subscriptionOnly: 'passed',
  isolation: 'passed',
  checkedAt: '2026-10-10T00:00:00.000Z',
};

const record = (id: string): RunCheckRecord => ({
  id,
  provider: 'claude',
  model: 'sonnet',
  trigger: 'run_start',
  checkedAt: '2026-10-10T00:00:00.000Z',
  items: {
    subscriptionLogin: { outcome: 'passed', basis: 'login status' },
    environmentSanitized: { outcome: 'passed', basis: 'env' },
    cliConfig: { outcome: 'passed', basis: 'config' },
    executionMode: { outcome: 'passed', basis: 'mode' },
  },
  removedEnvVarNames: [],
  subscriptionOnly: 'passed',
  executed: true,
});

function fakeProbe(model: Partial<ClaudeModelCheck> = {}): ClaudeProbe {
  return {
    candidates: ['haiku', 'sonnet', 'opus', 'fable'],
    check: vi.fn(() => Promise.resolve(OK_CHECK)),
    verifyModel: vi.fn<ClaudeProbe['verifyModel']>(() =>
      Promise.resolve({
        verification: 'passed',
        quotaExhausted: false,
        blocked: false,
        record: null,
        ...model,
      }),
    ),
  };
}

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-t058-providers-'));
  file = path.join(dir, 'rolecraft.db');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** 開一次資料庫、跑 fn、關掉（模擬一次 helper 程序）。 */
async function session<T>(fn: (store: ProvidersStore) => Promise<T>): Promise<T> {
  const { db } = openDatabase(file);
  try {
    return await fn(createProvidersStore(db));
  } finally {
    db.close();
  }
}

let n = 0;
const newCandidateId = () => `c${String(++n).padStart(8, '0')}`;

describe('providers 持久化（P1-T058）', () => {
  it('選定模型存模型別名；重啟後候選 ID 換新仍對回同一模型，狀態回到需重新檢查', async () => {
    await session(async (store) => {
      const providers = createProvidersService({
        claudeProbe: fakeProbe({ record: record('11111111-1111-4111-8111-111111111111') }),
        store,
        newCandidateId,
      });
      await providers.recheck('claude');
      const sonnet = (await providers.listCandidates('claude'))[1];
      if (!sonnet) throw new Error('no candidate');
      expect(await providers.selectCandidate('claude', sonnet.candidateId)).toEqual({
        kind: 'verified',
        verification: 'passed',
      });
    });

    await session(async (store) => {
      const providers = createProvidersService({ claudeProbe: fakeProbe(), store, newCandidateId });
      const candidates = await providers.listCandidates('claude');
      const [claude] = await providers.status();
      expect(claude?.state).toBe('eligibility_unknown');
      expect(claude?.checkedAt).toBeNull();
      expect(claude?.selectedCandidateId).toBe(candidates[1]?.candidateId);
      expect(candidates[1]?.label).toBe('Claude Sonnet');
    });

    const { db } = openDatabase(file);
    const repos = createRepositories(db);
    expect(repos.providerSelections.get('claude')).toBe('sonnet');
    expect(repos.providerConnections.get('claude')).toMatchObject({
      login: 'passed',
      availableModels: ['sonnet'],
      checkedAt: OK_CHECK.checkedAt,
    });
    expect(repos.runCheckRecords.listByProvider('claude').map((r) => r.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
    db.close();
  });

  it('短驗證沒通過：不改保存的選定；保存的模型已不在候選清單就不選', async () => {
    await session((store) => {
      store.saveSelectedModel('claude', 'retired-model');
      return Promise.resolve();
    });
    await session(async (store) => {
      const providers = createProvidersService({
        claudeProbe: fakeProbe({ verification: 'failed' }),
        store,
      });
      expect((await providers.status())[0]?.selectedCandidateId).toBeNull();
      await providers.recheck('claude');
      const [first] = await providers.listCandidates('claude');
      await providers.selectCandidate('claude', first?.candidateId ?? '');
      expect((await providers.status())[0]?.selectedCandidateId).toBeNull();
      expect(store.loadSelectedModel('claude')).toBe('retired-model');
    });
  });

  it('資料區寫入失敗：記憶體狀態與這次選定照常', async () => {
    const failing: ProvidersStore = {
      loadSelectedModel: () => null,
      saveSelectedModel: () => {
        throw new Error('disk');
      },
      saveConnection: () => {
        throw new Error('disk');
      },
      appendRunCheck: () => {
        throw new Error('disk');
      },
    };
    const providers = createProvidersService({
      claudeProbe: fakeProbe({ record: record('22222222-2222-4222-8222-222222222222') }),
      store: failing,
    });
    expect((await providers.recheck('claude')).state).toBe('available');
    const [first] = await providers.listCandidates('claude');
    const result = await providers.selectCandidate('claude', first?.candidateId ?? '');
    expect(result).toEqual({ kind: 'verified', verification: 'passed' });
    expect((await providers.status())[0]?.selectedCandidateId).toBe(first?.candidateId);
  });
});
