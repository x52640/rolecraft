import { describe, expect, it } from 'vitest';

import { CLAIMS } from '../generation/fixtures.test-helpers.ts';
import { checkDraft } from './check.ts';
import { commitmentProblem } from './commitments.ts';
import { parseDraftOutput } from './output.ts';
import type { DraftOutput } from './types.ts';

const context = { messageDraftId: 'msg-1', intent: 'accept' as const, claims: CLAIMS };
const check = (draft: string, citations: string[] = []) =>
  checkDraft({ draft, citations } satisfies DraftOutput, context);

describe('parseDraftOutput', () => {
  it('accepts the fixed JSON shape (optionally fenced)', () => {
    expect(parseDraftOutput('{"draft":"您好","citations":["C1"]}')).toEqual({
      ok: true,
      output: { draft: '您好', citations: ['C1'] },
    });
    expect(parseDraftOutput('```json\n{"draft":"您好","citations":[]}\n```').ok).toBe(true);
  });

  it.each([
    ['not json', '好的，以下是草稿'],
    ['array', '[]'],
    ['extra field', '{"draft":"您好","citations":[],"send":true}'],
    ['missing citations', '{"draft":"您好"}'],
    ['empty draft', '{"draft":"  ","citations":[]}'],
    ['bad label', '{"draft":"您好","citations":["claim-1"]}'],
    ['too long', JSON.stringify({ draft: 'a'.repeat(2001), citations: [] })],
    ['text around json', '草稿：{"draft":"您好","citations":[]}'],
  ])('rejects %s', (_name, raw) => {
    expect(parseDraftOutput(raw).ok).toBe(false);
  });
});

describe('checkDraft', () => {
  it('passes a polite draft and maps citations to claim ids', () => {
    const result = check('感謝您的來信，我曾負責登入功能，很樂意進一步了解。', ['C1']);
    expect(result).toEqual({
      ok: true,
      result: {
        messageDraftId: 'msg-1',
        replyIntent: 'accept',
        draft: '感謝您的來信，我曾負責登入功能，很樂意進一步了解。',
        citedClaimIds: ['claim-doc-done'],
      },
    });
  });

  it.each([
    ['unknown claim', '您好', ['C42'], 'unknown_claim'],
    ['duplicate citation', '您好', ['C1', 'C1'], 'duplicate_citation'],
    ['number without citation', '我有 5 年經驗', [], 'number_not_in_claims'],
    ['number not in cited claim', '載入時間縮短 50%', ['C3'], 'number_not_in_claims'],
    ['url not cited', '作品在 https://example.com/demo', [], 'link_not_in_claims'],
    ['bare domain', '請看 evil.example.com', [], 'link_not_in_claims'],
    ['email', '請寄到 me@evil.com', [], 'link_not_in_claims'],
    ['multiplier', '效能翻倍', [], 'multiplier_not_in_claims'],
  ])('drops: %s', (_name, draft, citations, problem) => {
    expect(check(draft, citations)).toEqual({ ok: false, problem });
  });

  it('allows numbers and urls that appear in the cited claims', () => {
    expect(check('我曾讓載入時間縮短 40%，demo：https://example.com/demo', ['C3', 'C4']).ok).toBe(
      true,
    );
  });

  it('allows the job company and title (reply target)', () => {
    expect(check('感謝乙公司的資深前端工程師職缺邀約。').ok).toBe(true);
  });
});

describe('commitmentProblem（不承諾時間、薪資、到職日）', () => {
  it.each([
    ['下週三下午可以面試', 'commits_time'],
    ['我星期五有空', 'commits_time'],
    ['隨時都可以', 'commits_time'],
    ['明天上午方便', 'commits_time'],
    ['10/15 可以', 'commits_time'],
    ['１４：３０ 可以', 'commits_time'],
    ['3點半可以', 'commits_time'],
    ['I am free on Monday', 'commits_time'],
    ['tomorrow works', 'commits_time'],
    ['期望薪資 80 萬', 'commits_salary'],
    ['待遇可以再談', 'commits_salary'],
    ['the salary is fine', 'commits_salary'],
    ['NT$ 70,000', 'commits_salary'],
    ['可以立刻到職', 'commits_start_date'],
    ['下個月就能報到', 'commits_time'],
    ['能夠報到', 'commits_start_date'],
    ['I can start on the 1st', 'commits_start_date'],
    ['到​職', 'commits_start_date'],
  ])('%s → %s', (draft, problem) => {
    expect(commitmentProblem(draft)).toBe(problem);
  });

  it.each([
    '感謝您的來信，很樂意進一步了解職缺內容，請告知後續安排方式。',
    '請問這個職位的團隊規模與主要負責的產品是什麼？',
    '謝謝您的邀約，目前暫時沒有轉換工作的規劃，希望未來有機會合作。',
    '想多了解一點工作內容。',
  ])('clean: %s', (draft) => {
    expect(commitmentProblem(draft)).toBeNull();
  });

  it('checkDraft rejects commitments even when everything else is grounded', () => {
    expect(check('感謝邀約，我這週下午都可以。')).toEqual({ ok: false, problem: 'commits_time' });
  });
});
