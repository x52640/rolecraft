import { describe, expect, it, vi } from 'vitest';

import type { ClaudeCheck, ClaudeModelCheck, ClaudeProbe } from './claude-probe.ts';
import { CLAUDE_VERIFY_SLOT_DEADLINE_MS, createProvidersService } from './providers-service.ts';

/** P1-T044 對抗驗證：單一驗證槽位必定釋放，probe 卡住也不會讓其他候選永遠 not_available。 */

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

  it('硬期限大於 probe 自己的最壞逾時（自動重新驗證 6 次啟動）', () => {
    expect(CLAUDE_VERIFY_SLOT_DEADLINE_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
  });
});
