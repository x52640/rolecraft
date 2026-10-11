import { describe, expect, it, vi } from 'vitest';

import type { ClaudeCheck, ClaudeModelCheck, ClaudeProbe } from './claude-probe.ts';
import { CLAUDE_VERIFY_SLOT_DEADLINE_MS, createProvidersService } from './providers-service.ts';

/** P1-T044 對抗驗證：單一驗證槽位必定釋放，probe 卡住也不會讓其他候選永遠 not_available。 */

interface Hung {
  resolve: (value: ClaudeCheck) => void;
  reject: (reason: unknown) => void;
}

const OK_CHECK: ClaudeCheck = {
  installed: 'passed',
  login: 'passed',
  eligibility: 'passed',
  subscriptionOnly: 'passed',
  isolation: 'passed',
  checkedAt: '2026-10-10T00:00:00.000Z',
};

describe('驗證槽位硬期限', () => {
  it('verifyModel 永不結束 → 硬期限到釋放槽位、回 unknown；之後可選其他候選，過期結果不寫狀態', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let finishHung!: (value: ClaudeModelCheck) => void;
      const probe = {
        candidates: ['haiku', 'sonnet'],
        check: vi.fn(() => Promise.resolve(OK_CHECK)),
        verifyModel: vi.fn<ClaudeProbe['verifyModel']>(),
      } satisfies ClaudeProbe;
      probe.verifyModel.mockImplementationOnce(() => new Promise((r) => (finishHung = r)));
      probe.verifyModel.mockResolvedValue({
        verification: 'passed',
        quotaExhausted: false,
        blocked: false,
        record: null,
      });
      let i = 0;
      const svc = createProvidersService({ claudeProbe: probe, newCandidateId: () => `c${i++}` });
      await svc.recheck('claude');

      const hung = svc.selectCandidate('claude', 'c0');
      expect(await svc.selectCandidate('claude', 'c1')).toEqual({ kind: 'not_available' });
      await vi.advanceTimersByTimeAsync(CLAUDE_VERIFY_SLOT_DEADLINE_MS + 1);
      expect(await hung).toEqual({ kind: 'verified', verification: 'unknown' });

      expect(await svc.selectCandidate('claude', 'c1')).toEqual({
        kind: 'verified',
        verification: 'passed',
      });
      expect(probe.verifyModel).toHaveBeenLastCalledWith('sonnet');

      // 卡住的那次很晚才回額度用完：已過期，不能蓋掉狀態或選定
      finishHung({ verification: 'failed', quotaExhausted: true, blocked: false, record: null });
      await vi.advanceTimersByTimeAsync(0);
      const [claude] = await svc.status();
      expect(claude?.state).toBe('available');
      expect(claude?.selectedCandidateId).toBe('c1');
    } finally {
      vi.useRealTimers();
    }
  });

  // P1-T055：被擋後的自動重新檢查卡過硬期限，期間另一候選寫入 quota_exhausted；
  // 舊的重新檢查晚回（成功或失敗）都不能再寫狀態。
  it.each([
    ['成功', (r: Hung) => r.resolve(OK_CHECK)],
    ['失敗', (r: Hung) => r.reject(new Error('late'))],
  ])('被擋後的重新檢查卡過硬期限、晚到%s → 不蓋掉其他候選的 quota_exhausted', async (_, finish) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let hungCheck!: Hung;
      const probe = {
        candidates: ['haiku', 'sonnet'],
        check: vi.fn<ClaudeProbe['check']>(),
        verifyModel: vi.fn<ClaudeProbe['verifyModel']>(),
      } satisfies ClaudeProbe;
      probe.check.mockResolvedValueOnce(OK_CHECK);
      probe.check.mockImplementationOnce(
        () => new Promise((resolve, reject) => (hungCheck = { resolve, reject })),
      );
      probe.verifyModel.mockResolvedValueOnce({
        verification: 'unknown',
        quotaExhausted: false,
        blocked: true,
        record: null,
      });
      probe.verifyModel.mockResolvedValueOnce({
        verification: 'failed',
        quotaExhausted: true,
        blocked: false,
        record: null,
      });
      let i = 0;
      const svc = createProvidersService({ claudeProbe: probe, newCandidateId: () => `c${i++}` });
      await svc.recheck('claude');

      const blocked = svc.selectCandidate('claude', 'c0');
      await vi.advanceTimersByTimeAsync(CLAUDE_VERIFY_SLOT_DEADLINE_MS + 1);
      expect(await blocked).toEqual({ kind: 'verified', verification: 'unknown' });
      expect(probe.check).toHaveBeenCalledTimes(2);

      expect(await svc.selectCandidate('claude', 'c1')).toEqual({
        kind: 'verified',
        verification: 'failed',
      });
      expect((await svc.status())[0]?.state).toBe('quota_exhausted');

      finish(hungCheck);
      await vi.advanceTimersByTimeAsync(0);
      const [claude] = await svc.status();
      expect(claude?.state).toBe('quota_exhausted');
      expect(claude?.checkedAt).toBe(OK_CHECK.checkedAt);
    } finally {
      vi.useRealTimers();
    }
  });

  it('硬期限大於 probe 自己的最壞逾時（自動重新驗證 6 次啟動）', () => {
    expect(CLAUDE_VERIFY_SLOT_DEADLINE_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });
});
