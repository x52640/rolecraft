import { describe, expect, it } from 'vitest';

import {
  IntroCheckView,
  IntroGenerationView,
  INTRO_EDIT_MAX_CHARS,
} from '../bridge/editor/intro.ts';
import { ApplicationIntro, INTRO_MAX_CHARS, introLength } from './application-intro.ts';

describe('投遞自介（P1-T064）', () => {
  it('字數以 code point 計，含標點與空白', () => {
    expect(INTRO_MAX_CHARS).toBe(300);
    expect(introLength('我 是，ab')).toBe(6);
    expect(introLength('😀😀')).toBe(2);
    expect(INTRO_EDIT_MAX_CHARS).toBeGreaterThan(INTRO_MAX_CHARS);
  });

  it('產生狀態：只有失敗有原因，只有檢查不通過有問題代碼', () => {
    const ok = (v: unknown) => IntroGenerationView.safeParse(v).success;
    expect(ok({ state: 'running', failure: null, problem: null })).toBe(true);
    expect(ok({ state: 'failed', failure: 'check_failed', problem: 'too_long' })).toBe(true);
    expect(ok({ state: 'failed', failure: 'check_failed', problem: null })).toBe(false);
    expect(ok({ state: 'failed', failure: 'provider_error', problem: 'too_long' })).toBe(false);
    expect(ok({ state: 'succeeded', failure: 'provider_error', problem: null })).toBe(false);
  });

  it('自介實體 strict：多帶欄位不收', () => {
    const intro = {
      jobSnapshotId: 'job-1',
      text: '您好',
      citations: [{ claimId: 'c1' }],
      generatedAt: '2026-10-12T01:00:00.000Z',
      userEdited: false,
    };
    expect(ApplicationIntro.safeParse(intro).success).toBe(true);
    expect(ApplicationIntro.safeParse({ ...intro, sent: true }).success).toBe(false);
  });

  it('檢查結果：承諾字眼只能放在 warning（D25：使用者編輯只提示），不能當 problem', () => {
    const base = { length: 3, problem: null, warning: null, citations: [] };
    expect(IntroCheckView.safeParse(base).success).toBe(true);
    expect(IntroCheckView.safeParse({ ...base, warning: 'commits_salary' }).success).toBe(true);
    expect(IntroCheckView.safeParse({ ...base, problem: 'commits_salary' }).success).toBe(false);
    expect(IntroCheckView.safeParse({ ...base, warning: 'too_long' }).success).toBe(false);
  });
});
