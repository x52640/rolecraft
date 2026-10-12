// P1-T071 未通過草稿：問題片段、寬鬆引用、可用數字清單、「請 AI 修正」的回饋提示。一律用假 provider。
import { createFakeAdapter, runWithSubscriptionCheck } from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import {
  CLAIMS,
  INJECTION,
  UNUSABLE,
  budget,
  idSource,
  profile,
  snapshot,
} from '../generation/fixtures.test-helpers.ts';
import { checkIntro, introProblemFragments, withoutJobNames } from './check.ts';
import { prepareIntro, type PreparedIntro } from './prepare.ts';
import { runIntro } from './run.ts';
import type { IntroFeedback } from './types.ts';

const inputs = () => ({
  jobSnapshot: snapshot(),
  profile: profile({ personalInfo: { 姓名: '王小明', 電話: '0912345678' } }),
  claims: [...CLAIMS, ...UNUSABLE],
});

function prepared(feedback: IntroFeedback | null = null): PreparedIntro {
  const result = prepareIntro('job-1', inputs(), budget(200_000), idSource('p'), feedback);
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

const json = (intro: string, citations: object[] = [{ claim: 'C3' }]) =>
  JSON.stringify({ intro, citations });

async function run(text: string, feedback: IntroFeedback | null = null) {
  const adapter = createFakeAdapter({ script: [{ text }] });
  const result = await runIntro(prepared(feedback), {
    provider: 'claude',
    model: 'fake-model',
    execute: ({ prompt }) =>
      runWithSubscriptionCheck(
        adapter,
        { model: 'fake-model', prompt, trigger: 'run_start' },
        { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'run-check' },
      ),
    signal: 'signal',
    recordRunCheck: () => Promise.resolve(),
  });
  return { result, prompts: adapter.calls.prompts };
}

/** 資料區塊的內容（找不到回 null）。 */
function block(prompt: string, kind: string): string | null {
  const match = new RegExp(`<<<DATA ${kind} (\\w+)>>>\\n([\\s\\S]*?)\\n<<<END ${kind} \\1>>>`, 'u');
  return match.exec(prompt)?.[2] ?? null;
}

describe('未通過草稿（P1-T071）', () => {
  it('數字沒有出處：回草稿，含原文、引用與問題片段（沒有出處的數字）', async () => {
    const { result } = await run(json('載入時間縮短 40%，服務 12 萬人。'));
    expect(result).toMatchObject({ ok: false, failure: 'check_failed' });
    if (result.ok) return;
    expect(result.draft).toEqual({
      text: '載入時間縮短 40%，服務 12 萬人。',
      citations: [{ claimId: 'claim-metric' }],
      problem: 'number_not_grounded',
      fragments: [expect.stringContaining('12') as unknown],
    });
  });

  it('引用編號不存在：仍保留草稿，只留存在、不重複的引用', async () => {
    const { result } = await run(
      json('載入時間縮短 40%。', [{ claim: 'C3' }, { claim: 'C9' }, { claim: 'C3' }]),
    );
    expect(result).toMatchObject({ ok: false, problem: 'unknown_claim' });
    expect(!result.ok && result.draft?.citations).toEqual([{ claimId: 'claim-metric' }]);
  });

  it('格式不合格、承諾字眼：格式不合格沒有草稿；承諾字眼有草稿但沒有片段', async () => {
    expect((await run('不是 JSON')).result).toMatchObject({
      failure: 'invalid_output',
      draft: null,
    });
    const { result } = await run(json('載入時間縮短 40%，薪資面議。'));
    expect(result).toMatchObject({ problem: 'commits_salary', draft: { fragments: [] } });
  });

  it('問題片段只在問題是出處類時才有', () => {
    const ctx = { claims: CLAIMS, profile: null };
    const cite = [{ claimId: 'claim-metric' }];
    expect(
      introProblemFragments('縮短 40%，多 7 倍', cite, ctx, 'multiplier_not_grounded'),
    ).toEqual([]);
    expect(introProblemFragments('縮短 40%，服務 9 人', cite, ctx, 'too_long')).toEqual([]);
    expect(introProblemFragments('縮短 40%，服務 9 人', cite, ctx, 'number_not_grounded')).toEqual([
      expect.stringContaining('9') as unknown,
    ]);
  });
});

describe('可用數字清單（P1-T071）', () => {
  it('提示列出事實項與已確認個人資料的數字，按出處分行；不含聯絡資訊欄位、不可用事實項', () => {
    const { prompt } = prepared();
    const numbers = block(prompt, 'ALLOWED_NUMBERS');
    expect(numbers).not.toBeNull();
    expect(numbers).toContain('C3：40%');
    expect(numbers).toMatch(/個人資料：.*2021/u);
    expect(numbers).not.toContain('0912345678');
    expect(prompt).not.toContain('0912345678');
    expect(prompt).toContain('數字只能逐字照抄下方「可用數字」清單');
  });
});

describe('請 AI 修正的提示（P1-T071）', () => {
  const feedback: IntroFeedback = {
    previous: `服務 12 萬人。${INJECTION}`,
    problem: 'number_not_grounded',
    fragments: ['12'],
  };

  it('上一版草稿與問題片段放在資料區塊，問題說明在區塊外', () => {
    const { prompt } = prepared(feedback);
    expect(block(prompt, 'PREVIOUS_DRAFT')).toBe(feedback.previous);
    expect(block(prompt, 'PROBLEM_FRAGMENTS')).toBe('12');
    expect(prompt).toContain('上一版沒有通過檢查：有數字沒有出處');
    // 草稿裡的注入文字只出現在資料區塊內
    const at = prompt.indexOf(INJECTION, prompt.indexOf('<<<DATA PREVIOUS_DRAFT'));
    expect(at).toBeGreaterThan(prompt.indexOf('<<<DATA PREVIOUS_DRAFT'));
    expect(prompt.indexOf('<<<END PREVIOUS_DRAFT', at)).toBeGreaterThan(at);
  });

  it('修正後合格：照常通過檢查；一般產生沒有回饋段', async () => {
    const { result, prompts } = await run(json('載入時間縮短 40%，期待貢獻所長。'), feedback);
    expect(result.ok).toBe(true);
    expect(prompts[0]).toContain('PREVIOUS_DRAFT');
    expect(prepared().prompt).not.toContain('PREVIOUS_DRAFT');
  });
});

describe('公司名稱、職稱裡的數字（P1-T071）', () => {
  const ctx = (jobNames: string[] = []) => ({ claims: CLAIMS, profile: null, jobNames });
  const cite = [{ claimId: 'claim-metric' }];
  const NAMES = ['104資訊科技', '資深前端工程師 II3'];

  it('只在名稱那段文字內算有出處；名稱外的同一個數字仍要有出處', () => {
    const named = '應徵104資訊科技的資深前端工程師 II3，曾讓載入時間縮短 40%。';
    expect(checkIntro(named, cite, ctx(NAMES))).toBeNull();
    expect(checkIntro(named, cite, ctx())).toBe('number_not_grounded');
    expect(checkIntro('載入時間縮短 40%，服務 104 人。', cite, ctx(NAMES))).toBe(
      'number_not_grounded',
    );
    expect(checkIntro('應徵104資訊科技，載入時間縮短 3%。', cite, ctx(NAMES))).toBe(
      'number_not_grounded',
    );
  });

  it('名稱要有邊界：前後緊鄰英數字的不算名稱，只豁免名稱本身', () => {
    expect(withoutJobNames('應徵3M，3MB、X3M 與 13M；3M。', ['3M'])).toBe(
      '應徵 ,3MB、X3M 與 13M; 。',
    );
    const names = ['3M', '前端工程師'];
    expect(checkIntro('應徵3M的前端工程師，載入時間縮短 40%。', cite, ctx(names))).toBeNull();
    for (const text of ['應徵3M，傳輸 3MB，載入時間縮短 40%。', '應徵X3M，載入時間縮短 40%。']) {
      expect(checkIntro(text, cite, ctx(names))).toBe('number_not_grounded');
    }
  });

  it('全形數字的名稱也照正規化後比對', () => {
    expect(checkIntro('應徵１０４資訊科技，載入時間縮短 40%。', cite, ctx(NAMES))).toBeNull();
  });

  it('產生時用已確認快照的公司與職稱', async () => {
    const result = prepareIntro(
      'job-1',
      {
        ...inputs(),
        jobSnapshot: snapshot({ fields: { ...snapshot().fields, company: '104資訊科技' } }),
      },
      budget(200_000),
      idSource('p'),
    );
    expect(result.ok && result.prepared.jobNames).toEqual(['104資訊科技', '資深前端工程師']);
    expect((await run(json('應徵貴公司，載入時間縮短 40%。'))).result.ok).toBe(true);
  });
});
