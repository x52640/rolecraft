import { describe, expect, it } from 'vitest';

import { CLAIMS, claim } from '../generation/fixtures.test-helpers.ts';
import { checkDraft, draftGroundingProblem } from './check.ts';
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
    ['I can start on the 1st', 'commits_time'],
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

describe('對抗驗證補強：承諾字眼、隱形字元、聯絡方式', () => {
  it.each([
    ['晚間可以聊聊', 'commits_time'],
    ['午後方便', 'commits_time'],
    ['清晨、凌晨、黃昏都行', 'commits_time'],
    ['假日也可以', 'commits_time'],
    ['平日都在', 'commits_time'],
    ['下旬再說', 'commits_time'],
    ['過年後', 'commits_time'],
    ['節後聯繫', 'commits_time'],
    ['Good morning, see you in the afternoon', 'commits_time'],
    ['any weekday works', 'commits_time'],
    ['I can reply ASAP', 'commits_time'],
    ['as soon as possible', 'commits_time'],
    ['right away', 'commits_time'],
    ['in March', 'commits_time'],
    ['on the 3rd', 'commits_time'],
    ['the fifteenth', 'commits_time'],
    ['期望年收再談', 'commits_salary'],
    ['目前收入', 'commits_salary'],
    ['the package looks fine', 'commits_salary'],
    ['what is the pay range', 'commits_salary'],
    ['很期待加入貴團隊', 'commits_start_date'],
    ['可以開始了', 'commits_start_date'],
    ['回覆即可', 'commits_start_date'],
    ['需要交接', 'commits_start_date'],
    ['正在辦理離職', 'commits_start_date'],
    ['I could begin soon', 'commits_start_date'],
    ['happy to join', 'commits_start_date'],
    ['I can start', 'commits_start_date'],
    ['I am available', 'commits_start_date'],
    ['到 職', 'commits_start_date'],
    ['到­職', 'commits_start_date'],
    ['到⁣職', 'commits_start_date'],
    ['到᠎職', 'commits_start_date'],
    ['到͏職', 'commits_start_date'],
    ['到\u{E0041}職', 'commits_start_date'],
    ['薪 資', 'commits_salary'],
    ['me@example.org', 'contact_info'],
    ['me (at) example (dot) org', 'contact_info'],
    ['me [at] example [.] org', 'contact_info'],
    ['me at example dot org', 'contact_info'],
    ['LINE ID：abc123', 'contact_info'],
    ['line: my.id', 'contact_info'],
    ['WeChat ID abc_1', 'contact_info'],
    ['Telegram: @someone', 'contact_info'],
    ['WhatsApp 帳號 abc', 'contact_info'],
    ['微信號：abc123', 'contact_info'],
  ])('%s → %s', (draft, problem) => {
    expect(commitmentProblem(draft)).toBe(problem);
  });

  it.each([
    '謝謝您的邀約，目前暫時沒有轉換工作的規劃，希望未來有機會合作，再次感謝。',
    '感謝您的來信與說明。目前我想專注在現有的工作上，這次先婉拒，祝徵才順利。',
    '感謝您的來信。想請問這個職位主要負責哪些產品？團隊目前的分工與技術棧為何？',
    '謝謝您的邀約，我對這個職缺很有興趣，想進一步了解職務內容，請告知後續安排方式。',
  ])('正常的婉拒／詢問／接受草稿仍通過：%s', (draft) => {
    expect(commitmentProblem(draft)).toBeNull();
    expect(check(draft).ok).toBe(true);
  });

  it.each(['請看 evil。com', '請看 evil｡com', '請看 evil[.]com', '請看 evil dot com', 'evil­.com'])(
    '隱形字元與點的變體不能繞過網域檢查：%s',
    (draft) => {
      expect(check(draft)).toEqual({ ok: false, problem: 'link_not_in_claims' });
    },
  );
});

describe('P1-T047：句點變體只用在網域與 email 辨識', () => {
  it.each([
    'me@example。org',
    'me＠ｅｘａｍｐｌｅ．ｏｒｇ',
    'me (at) example｡org',
    'me [at] example ［.］ org',
    'me at example dot org',
  ])('email 仍被擋：%s', (draft) => {
    expect(commitmentProblem(draft)).toBe('contact_info');
  });

  it('中文句號不會把數字黏成小數', () => {
    const metric = claim('m1', {
      type: 'outcome_metric',
      text: '平均評分為 3。14 位成員',
      completionStatus: null,
    });
    expect(draftGroundingProblem('平均評分為 3.14', [metric])).toBe('number_not_in_claims');
    expect(draftGroundingProblem('平均評分為 3', [metric])).toBeNull();
  });
});

describe('P1-T047 對抗驗證：訊息草稿的網址抽取比照段落', () => {
  const link = (text: string) => [claim('l1', { type: 'link', text, completionStatus: null })];

  it.each([
    ['網站 https://a.com/x，已上線', '網站 https://a.com/x'],
    ['網站 https://a.com/x', '網站 https://a.com/x，已上線'],
    ['網站 https://a.com/x', '網站 https://a.com/x；React'],
    ['作品集 https://a.com/x', '[a.com/x](https://a.com/x)'],
  ])('全形標點不黏進網址：%s → %s', (source, draft) => {
    expect(draftGroundingProblem(draft, link(source))).toBeNull();
  });

  it('捏造的 IPv6 網址仍被擋', () => {
    expect(draftGroundingProblem('入口 http://[abcd::ef]/admin', link('https://a.com/x'))).toBe(
      'link_not_in_claims',
    );
  });
});
