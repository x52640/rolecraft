// 端到端（P1-T080）：104 履歷編輯頁結構的擷取 → submit_resume_capture → import.ai_parse → import.ai_status。
// 區塊仿 apps/extension/src/sites/104/fixtures/resume-edit.html（去識別化 fixture；P1-T077 的 expected-blocks.json
// 尚未在 main，結構比照 pipeline web-review-fixes 測試的 104 段落形式）。假 provider 記錄真正送出的提示，
// 斷言不含姓名、英文名、電話、email、地址與網址；個人資料只由本機預填。
import { describe, expect, it } from 'vitest';

import { SECRET_URL, capture, h, p, webEnv } from './__fixtures__/web-env.ts';

const BLOCKS = [
  p('林雨晴'), // b1 頁首姓名（沒有標籤）
  p('細心負責'), // b2
  p('樂於溝通協調'), // b3
  p('個人資料'), // b4
  p('女 34歲 免役'), // b5
  p('就業狀態'), // b6
  p('待業中'), // b7
  p('主要手機'), // b8
  p('0900-000-000'), // b9
  p('E-mail'), // b10
  p('ivy.lin@example.com'), // b11
  p('通訊地址'), // b12
  p('高雄市苓雅區範例路***'), // b13
  p('英文姓名'), // b14
  p('Ivy'), // b15
  p('聯絡方式'), // b16
  p('(上班時段，10:00~17:00)'), // b17
  h(2, '學歷'), // b18
  p('範例科技大學'), // b19
  p('餐旅管理系'), // b20
  h(2, '工作經驗'), // b21
  h(3, '門市營運主任'), // b22
  p('Sunrise_晨曦烘焙股份有限公司（餐飲業 30~100人）'), // b23
  p('2024/5~仍在職'), // b24
  p('負責三家門市的日常營運與排班，每週檢視來客數與客單價。'), // b25
  h(2, '自傳'), // b26
  p('林雨晴 Ivy Lin，高雄人。第一份打工在巷口的麵包店。'), // b27
  p('Ivy Lin, from Kaohsiung. My first part-time job was at a small bakery.'), // b28
];

const f = (value: string, ...lines: string[]) => ({ value, lines });
const OUTPUT = JSON.stringify({
  education: [f('範例科技大學', 'b19')],
  experiences: [
    {
      company: f('Sunrise_晨曦烘焙股份有限公司', 'b23'),
      title: f('門市營運主任', 'b22'),
      start: f('2024/5', 'b24'),
      end: f('仍在職', 'b24'),
      description: f('負責三家門市的日常營運與排班，每週檢視來客數與客單價。', 'b25'),
    },
  ],
  skills: [],
  sections: [
    {
      heading: f('自傳', 'b26'),
      body: f('〔姓名〕 〔姓名2〕，高雄人。第一份打工在巷口的麵包店。', 'b27'),
    },
  ],
});

const SECRETS = [
  '林雨晴',
  'Ivy',
  'Ivy Lin',
  '0900-000-000',
  '0900',
  'ivy.lin@example.com',
  'ivy.lin',
  '範例路',
  '34歲',
  '免役',
  '上班時段',
  SECRET_URL,
  'pda.104.com.tw',
];

describe('104 履歷編輯頁結構：擷取到 AI 整理的端到端（P1-T080）', () => {
  it('提示不含姓名、英文名、電話、email、地址與網址；姓名與聯絡資料只由本機預填', async () => {
    const prompts: string[] = [];
    const env = webEnv({
      respond: (prompt) => {
        prompts.push(prompt);
        return OUTPUT;
      },
    });
    const importId = await env.submit(capture(BLOCKS, '林雨晴'));
    expect(env.state.executed).toHaveLength(0); // 擷取送達不呼叫模型

    const parse = await env.parse(importId);
    expect(env.state.executed).toHaveLength(1);
    expect(prompts).toEqual(env.state.executed);
    const prompt = env.state.executed[0] ?? '';
    for (const secret of SECRETS) expect(prompt).not.toContain(secret);
    expect(prompt).toContain('範例科技大學');
    expect(prompt).toContain('from Kaohsiung');

    expect(parse.state).toBe('succeeded');
    const draft = parse.webDraft;
    expect(draft?.experiences[0]?.company?.value).toBe('Sunrise_晨曦烘焙股份有限公司');
    expect(draft?.experiences[0]).toMatchObject({ startDate: { value: '2024/5' }, current: true });
    const info = Object.fromEntries(
      (draft?.personalInfo ?? []).map((r) => [r.label, r.value.value]),
    );
    expect(info).toMatchObject({
      姓名: '林雨晴',
      主要手機: '0900-000-000',
      'E-mail': 'ivy.lin@example.com',
      通訊地址: '高雄市苓雅區範例路***',
    });
    // 自傳還原出姓名：標示含個人資料
    expect(draft?.otherSections[0]?.body).toMatchObject({
      value: '林雨晴 Ivy Lin，高雄人。第一份打工在巷口的麵包店。',
      containsPersonalData: true,
    });
    // R6 紀錄照存
    expect(env.state.records).toHaveLength(1);
  });

  // 規格「送出條件」：姓名標籤的值（這裡只有英文姓名）就算辨識出本次頁面姓名，所以會送。沒有標籤的頁首中文名
  // 這時不在已知姓名裡、會進提示（殘餘，已回報；104 有登記姓名元素時由 nameText 遮掉，見上一個案例）。
  it('只有「英文姓名」標籤、沒有姓名元素：照規格會送；英文名與聯絡資料不進提示', async () => {
    const env = webEnv({ respond: () => OUTPUT });
    const importId = await env.submit(capture(BLOCKS, null));
    await env.parse(importId);
    expect(env.state.executed).toHaveLength(1);
    for (const secret of SECRETS.filter((s) => s !== '林雨晴')) {
      expect(env.state.executed[0]).not.toContain(secret);
    }
  });

  it('沒有姓名元素、頁面也沒有姓名標籤：不送，確認姓名後才送且仍不含姓名', async () => {
    const env = webEnv({ respond: () => OUTPUT });
    const blocks = BLOCKS.filter((b) => b.text !== '英文姓名' && b.text !== 'Ivy');
    const importId = await env.submit(capture(blocks, null));
    const refused = await env.call('import.ai_parse', { importId });
    expect(refused).toMatchObject({ ok: false, error: { reason: 'name_required' } });
    expect(env.state.executed).toHaveLength(0);
    await env.parse(importId, ['林雨晴', 'Ivy Lin']);
    expect(env.state.executed).toHaveLength(1);
    for (const secret of SECRETS) expect(env.state.executed[0]).not.toContain(secret);
  });
});
