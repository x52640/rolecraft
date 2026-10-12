import { BRIDGE_SCHEMAS, OpaqueId, type CheckOutcome } from '@rolecraft/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { HelperServices } from '../services.ts';
import type { ClaudeCheck, ClaudeModelCheck, ClaudeProbe } from './claude-probe.ts';
import { providersListCandidates } from './list-candidates.ts';
import { createProvidersService } from './providers-service.ts';
import { providersRecheck } from './recheck.ts';
import { providersSelectCandidate } from './select-candidate.ts';
import { providersStartLogin } from './start-login.ts';
import { claudeState } from './state.ts';
import { providersStatus } from './status.ts';

const OK_CHECK: ClaudeCheck = {
  installed: 'passed',
  login: 'passed',
  eligibility: 'passed',
  subscriptionOnly: 'passed',
  isolation: 'passed',
  checkedAt: '2026-10-10T00:00:00.000Z',
};

function fakeProbe(check: Partial<ClaudeCheck> = {}, model: Partial<ClaudeModelCheck> = {}) {
  const probe = {
    candidates: ['haiku', 'sonnet', 'opus', 'fable'],
    check: vi.fn(() => Promise.resolve({ ...OK_CHECK, ...check })),
    reverify: vi.fn<NonNullable<ClaudeProbe['reverify']>>(() =>
      Promise.resolve({ outcome: 'not_needed', reason: null }),
    ),
    verifyModel: vi.fn<ClaudeProbe['verifyModel']>(() =>
      Promise.resolve({
        verification: 'passed',
        quotaExhausted: false,
        blocked: false,
        record: null,
        ...model,
      }),
    ),
  } satisfies ClaudeProbe;
  return probe;
}

function setup(check: Partial<ClaudeCheck> = {}, model: Partial<ClaudeModelCheck> = {}) {
  const probe = fakeProbe(check, model);
  const providers = createProvidersService({ claudeProbe: probe });
  const services: HelperServices = { providers };
  return { probe, providers, services };
}

const valid = (op: keyof typeof BRIDGE_SCHEMAS, response: unknown) =>
  expect(BRIDGE_SCHEMAS[op].response.safeParse(response).success).toBe(true);

describe('狀態判定（S9-1、S9-3）', () => {
  it.each<[Partial<ClaudeCheck>, boolean, string]>([
    [{}, false, 'available'],
    [{}, true, 'quota_exhausted'],
    [{ installed: 'failed' }, false, 'tool_missing'],
    [{ installed: 'unknown' }, false, 'unsupported'],
    [{ isolation: 'failed' }, false, 'unsupported'],
    [{ isolation: 'unknown' }, false, 'unsupported'],
    [{ login: 'failed', subscriptionOnly: 'failed' }, false, 'not_logged_in'],
    [{ subscriptionOnly: 'failed' }, false, 'unsupported'],
    [{ subscriptionOnly: 'unknown' }, false, 'eligibility_unknown'],
    [{ login: 'unknown' }, false, 'eligibility_unknown'],
    [{ eligibility: 'unknown' }, false, 'eligibility_unknown'],
  ])('%j quota=%s → %s', (patch, quota, state) => {
    expect(claudeState({ ...OK_CHECK, ...patch }, quota)).toBe(state);
  });

  it('只有 R5（isolation）與 R6（subscriptionOnly）都 passed 才可能 available', () => {
    const values: CheckOutcome[] = ['passed', 'failed', 'unknown'];
    for (const isolation of values) {
      for (const subscriptionOnly of values) {
        const state = claudeState({ ...OK_CHECK, isolation, subscriptionOnly }, false);
        if (isolation !== 'passed' || subscriptionOnly !== 'passed') {
          expect(state).not.toBe('available');
        }
      }
    }
  });
});

describe('providers.status／recheck', () => {
  it('初始：建立服務不檢查；Codex、Antigravity 尚未支援；第一次查狀態自動檢查一次（P1-T070）', async () => {
    const { probe, services } = setup({ login: 'failed' });
    expect(probe.check).not.toHaveBeenCalled();
    const res = await providersStatus({}, services);
    valid('providers.status', res);
    if (!res.ok) throw new Error('應成功');
    expect(res.services.map((s) => [s.service, s.state])).toEqual([
      ['claude', 'not_logged_in'],
      ['codex', 'unsupported'],
      ['antigravity', 'unsupported'],
    ]);
    // 自動檢查不重新驗證（保證不呼叫模型）；之後查狀態不再檢查。
    expect(probe.check).toHaveBeenCalledTimes(1);
    expect(probe.check).toHaveBeenCalledWith({ reverify: false });
    await providersStatus({}, services);
    expect(probe.check).toHaveBeenCalledTimes(1);
    expect(probe.verifyModel).not.toHaveBeenCalled();
  });

  it.each(['codex', 'antigravity'] as const)('%s 重新檢查仍是尚未支援，不跑任何檢查', async (s) => {
    const { probe, services } = setup();
    const res = await providersRecheck({ service: s }, services);
    valid('providers.recheck', res);
    expect(res).toMatchObject({ ok: true, status: { service: s, state: 'unsupported' } });
    expect(probe.check).not.toHaveBeenCalled();
  });

  it('Claude 重新檢查後 status 回最近一次結果', async () => {
    const { services } = setup({ login: 'failed', subscriptionOnly: 'failed' });
    const res = await providersRecheck({ service: 'claude' }, services);
    valid('providers.recheck', res);
    expect(res).toMatchObject({ ok: true, status: { state: 'not_logged_in', login: 'failed' } });
    const all = await providersStatus({}, services);
    if (!all.ok) throw new Error('應成功');
    expect(all.services[0]).toMatchObject({
      state: 'not_logged_in',
      checkedAt: OK_CHECK.checkedAt,
    });
  });
});

describe('providers.list_candidates／select_candidate', () => {
  it('Claude 候選 ID 由 helper 配發（不透明、不是模型名稱），同一程序內穩定；其他家空清單', async () => {
    const { services } = setup();
    const a = await providersListCandidates({ service: 'claude' }, services);
    const b = await providersListCandidates({ service: 'claude' }, services);
    valid('providers.list_candidates', a);
    if (!a.ok || !b.ok) throw new Error('應成功');
    expect(a.candidates).toHaveLength(4);
    expect(b.candidates).toEqual(a.candidates);
    for (const c of a.candidates) {
      expect(OpaqueId.safeParse(c.candidateId).success).toBe(true);
      expect(['haiku', 'sonnet', 'opus', 'fable']).not.toContain(c.candidateId);
    }
    expect(await providersListCandidates({ service: 'codex' }, services)).toEqual({
      ok: true,
      candidates: [],
    });
  });

  it.each(['haiku', 'sonnet', 'claude-opus-5-5', 'x--model', 'abc', 'c0'])(
    '清單外的 ID %j → invalid_request，不呼叫驗證',
    async (candidateId) => {
      const { probe, services } = setup();
      await providersListCandidates({ service: 'claude' }, services);
      const res = await providersSelectCandidate({ service: 'claude', candidateId }, services);
      valid('providers.select_candidate', res);
      expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
      if (!res.ok) expect(res.error.message).not.toContain(candidateId);
      expect(probe.verifyModel).not.toHaveBeenCalled();
    },
  );

  it('Claude 的候選 ID 拿去選 Codex → invalid_request', async () => {
    const { probe, services } = setup();
    const list = await providersListCandidates({ service: 'claude' }, services);
    if (!list.ok) throw new Error('應成功');
    const candidateId = list.candidates[0]?.candidateId ?? '';
    const res = await providersSelectCandidate({ service: 'codex', candidateId }, services);
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(probe.verifyModel).not.toHaveBeenCalled();
  });

  it('清單內的 ID：用對照表的別名驗證；通過才記為選定', async () => {
    const { probe, providers, services } = setup();
    await providers.recheck('claude');
    const list = await providersListCandidates({ service: 'claude' }, services);
    if (!list.ok) throw new Error('應成功');
    const sonnet = list.candidates[1];
    if (!sonnet) throw new Error('缺候選');
    const res = await providersSelectCandidate(
      { service: 'claude', candidateId: sonnet.candidateId },
      services,
    );
    valid('providers.select_candidate', res);
    expect(res).toEqual({ ok: true, verification: 'passed' });
    expect(probe.verifyModel).toHaveBeenCalledWith('sonnet');
    const all = await providersStatus({}, services);
    if (!all.ok) throw new Error('應成功');
    expect(all.services[0]?.selectedCandidateId).toBe(sonnet.candidateId);
  });

  it('驗證失敗或無法確認：保留原本選定；額度用完 → 額度不足', async () => {
    const { probe, providers, services } = setup();
    await providers.recheck('claude');
    const list = await providersListCandidates({ service: 'claude' }, services);
    if (!list.ok) throw new Error('應成功');
    const [first, second] = list.candidates;
    if (!first || !second) throw new Error('缺候選');
    await providers.selectCandidate('claude', first.candidateId);

    probe.verifyModel.mockResolvedValueOnce({
      verification: 'failed',
      quotaExhausted: true,
      blocked: false,
      record: null,
    });
    const res = await providersSelectCandidate(
      { service: 'claude', candidateId: second.candidateId },
      services,
    );
    expect(res).toEqual({ ok: true, verification: 'failed' });
    const [claude] = await providers.status();
    expect(claude).toMatchObject({
      state: 'quota_exhausted',
      selectedCandidateId: first.candidateId,
    });
  });
});

describe('對抗驗證修正：被擋後更新狀態、合併重複驗證', () => {
  async function firstCandidate(services: HelperServices): Promise<string> {
    const list = await providersListCandidates({ service: 'claude' }, services);
    if (!list.ok || !list.candidates[0]) throw new Error('缺候選');
    return list.candidates[0].candidateId;
  }

  it('recheck → available，select 被擋（未執行）→ 重新檢查，state 不再是 available', async () => {
    const { probe, providers, services } = setup({}, { verification: 'unknown', blocked: true });
    expect((await providers.recheck('claude')).state).toBe('available');
    probe.check.mockResolvedValueOnce({ ...OK_CHECK, isolation: 'failed' });
    const res = await providersSelectCandidate(
      { service: 'claude', candidateId: await firstCandidate(services) },
      services,
    );
    expect(res).toEqual({ ok: true, verification: 'unknown' });
    expect(probe.check).toHaveBeenCalledTimes(2);
    const [claude] = await providers.status();
    expect(claude?.state).toBe('unsupported');
    expect(claude?.selectedCandidateId).toBeNull();
  });

  it('被擋後重新檢查仍說可用（或檢查丟錯）：也不保留 available，並更新 checkedAt', async () => {
    const { probe, providers, services } = setup({}, { verification: 'unknown', blocked: true });
    await providers.recheck('claude');
    const id = await firstCandidate(services);
    await providers.selectCandidate('claude', id);
    let [claude] = await providers.status();
    expect(claude?.state).toBe('eligibility_unknown');

    await providers.recheck('claude');
    probe.check.mockRejectedValueOnce(new Error('boom'));
    await providers.selectCandidate('claude', id);
    [claude] = await providers.status();
    expect(claude?.state).toBe('eligibility_unknown');
    expect(claude?.checkedAt).not.toBe(OK_CHECK.checkedAt);
  });

  it('10 個並行 select 同一候選 → 只呼叫 1 次 verifyModel', async () => {
    const { probe, providers, services } = setup();
    await providers.recheck('claude');
    const candidateId = await firstCandidate(services);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        providersSelectCandidate({ service: 'claude', candidateId }, services),
      ),
    );
    expect(probe.verifyModel).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r).toEqual({ ok: true, verification: 'passed' });
  });

  it('A 驗證進行中選 B → not_available、不呼叫模型；A 設的 quota_exhausted 不被 B 的重新檢查蓋掉', async () => {
    const { probe, providers, services } = setup();
    await providers.recheck('claude');
    const list = await providersListCandidates({ service: 'claude' }, services);
    if (!list.ok || !list.candidates[1]) throw new Error('缺候選');
    const [a, b] = list.candidates.map((c) => c.candidateId);
    let finishA!: (value: ClaudeModelCheck) => void;
    probe.verifyModel.mockImplementationOnce(() => new Promise((r) => (finishA = r)));
    probe.verifyModel.mockResolvedValue({
      verification: 'unknown',
      quotaExhausted: false,
      blocked: true,
      record: null,
    });
    const pendingA = providers.selectCandidate('claude', a ?? '');
    const sameA = providers.selectCandidate('claude', a ?? '');
    expect(await providers.selectCandidate('claude', b ?? '')).toEqual({ kind: 'not_available' });
    const viaHandler = await providersSelectCandidate(
      { service: 'claude', candidateId: b ?? '' },
      services,
    );
    expect(viaHandler).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(probe.verifyModel).toHaveBeenCalledTimes(1);
    finishA({ verification: 'failed', quotaExhausted: true, blocked: false, record: null });
    expect(await pendingA).toEqual({ kind: 'verified', verification: 'failed' });
    expect(await sameA).toEqual({ kind: 'verified', verification: 'failed' });
    expect((await providers.status())[0]?.state).toBe('quota_exhausted');
    expect(probe.check).toHaveBeenCalledTimes(1);
  });

  it.each(['quota_exhausted', 'auto_check_failed'] as const)(
    '狀態不是 available（%s）時 select → invalid_request，0 次模型呼叫',
    async (which) => {
      const { probe, providers, services } = setup(
        which === 'auto_check_failed' ? { login: 'failed' } : {},
        { verification: 'failed', quotaExhausted: true },
      );
      const candidateId = await firstCandidate(services);
      if (which === 'quota_exhausted') {
        await providers.recheck('claude');
        await providers.selectCandidate('claude', candidateId);
        expect((await providers.status())[0]?.state).toBe('quota_exhausted');
        probe.verifyModel.mockClear();
      }
      const res = await providersSelectCandidate({ service: 'claude', candidateId }, services);
      valid('providers.select_candidate', res);
      expect(res).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
      expect(probe.verifyModel).not.toHaveBeenCalled();
    },
  );
});

describe('未接服務與登入引導', () => {
  it('沒有 providers 服務：全部 not_implemented', async () => {
    const none: HelperServices = {};
    for (const res of [
      await providersStatus({}, none),
      await providersRecheck({ service: 'claude' }, none),
      await providersListCandidates({ service: 'claude' }, none),
      await providersSelectCandidate({ service: 'claude', candidateId: 'c1' }, none),
    ]) {
      expect(res).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
    }
  });

  it.each(['claude', 'codex', 'antigravity'] as const)(
    'start_login(%s)：不啟動任何程式，回 not_implemented',
    async (service) => {
      const { probe, services } = setup();
      const res = await providersStartLogin({ service }, services);
      valid('providers.start_login', res);
      expect(res).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
      expect(probe.check).not.toHaveBeenCalled();
      expect(probe.verifyModel).not.toHaveBeenCalled();
    },
  );
});
