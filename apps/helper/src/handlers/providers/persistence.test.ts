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

  /** 指定哪些寫入會失敗的 store（記憶體版）。 */
  function memoryStore(fails: { selection?: boolean; runCheck?: boolean; connection?: boolean }) {
    const disk = { selected: null as string | null, runs: [] as string[] };
    const boom = () => {
      throw new Error('disk');
    };
    const store: ProvidersStore = {
      loadSelectedModel: () => disk.selected,
      saveSelectedModel: (_p, model) => (fails.selection ? boom() : (disk.selected = model)),
      saveConnection: () => (fails.connection ? boom() : undefined),
      appendRunCheck: (r) => (fails.runCheck ? boom() : void disk.runs.push(r.id)),
    };
    return { disk, store };
  }

  async function selectSecond(store: ProvidersStore, recordId: string) {
    const providers = createProvidersService({
      claudeProbe: fakeProbe({ record: record(recordId) }),
      store,
    });
    await providers.recheck('claude');
    const candidates = await providers.listCandidates('claude');
    const selectedBefore = (await providers.status())[0]?.selectedCandidateId;
    const result = providers.selectCandidate('claude', candidates[1]?.candidateId ?? '');
    return { providers, result, selectedBefore };
  }

  it('選定寫不進資料區：回錯誤、記憶體保留原本的選定（重啟後不會回到舊模型而不自知）', async () => {
    const { disk, store } = memoryStore({ selection: true });
    disk.selected = 'opus';
    const { providers, result, selectedBefore } = await selectSecond(
      store,
      '33333333-3333-4333-8333-333333333333',
    );
    await expect(result).rejects.toThrow();
    expect((await providers.status())[0]?.selectedCandidateId).toBe(selectedBefore);
    expect(selectedBefore).not.toBeNull();
    expect(disk.selected).toBe('opus');
  });

  it('R6 確認紀錄寫不進資料區：這次驗證視同失敗、不記選定', async () => {
    const { disk, store } = memoryStore({ runCheck: true });
    const { providers, result } = await selectSecond(store, '44444444-4444-4444-8444-444444444444');
    expect(await result).toEqual({ kind: 'verified', verification: 'failed' });
    expect((await providers.status())[0]?.selectedCandidateId).toBeNull();
    expect(disk.selected).toBeNull();
  });

  it('連接狀態寫不進資料區：記憶體狀態照常（重啟後本來就要重新檢查）', async () => {
    const { disk, store } = memoryStore({ connection: true });
    const { providers, result } = await selectSecond(store, '55555555-5555-4555-8555-555555555555');
    expect(await result).toEqual({ kind: 'verified', verification: 'passed' });
    expect((await providers.status())[0]?.state).toBe('available');
    expect(disk.selected).toBe('sonnet');
    expect(disk.runs).toEqual(['55555555-5555-4555-8555-555555555555']);
  });
});
