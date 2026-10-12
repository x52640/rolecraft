// P1-T089：網頁來源欄位的出處與標黃判定（D29 2026-10-13 再裁定版）。內容為合成資料。
import type { ImportWebBlock } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { formFromAiDraft, type AiDraftLike } from './ai-form.ts';
import { flaggedCount, normalizeForMatch, webOriginOf } from './web-origin.ts';

const block = (id: string, text: string, label: string | null = null): ImportWebBlock => ({
  id,
  kind: label === null ? 'paragraph' : 'label_value',
  level: null,
  label,
  text,
  continues: false,
});

const BLOCKS = [
  block('b1', '範例科技股份有限公司　資深工程師'),
  block('b2', '2019/03 ~ 至今'),
  block('b3', 'SQL Server、Ｐｙｔｈｏｎ'),
  block('b4', '負責後端'),
  block('b5', '帶領三人團隊'),
  block('b6', '範例大學 資訊工程系', '學歷'),
];

const f = (value: string, blockId: string, containsPersonalData = false) => ({
  value,
  blockId,
  containsPersonalData,
});

describe('webOriginOf（D29）', () => {
  const originOf = webOriginOf(BLOCKS);

  it('值包含於單一出處區塊（取一部分、全半形與空白不計）→ 免標示', () => {
    expect(originOf([f('範例科技股份有限公司', 'b1')])).toEqual({ blockId: 'b1', flag: null });
    expect(originOf([f('資深 工程師', 'b1')])?.flag).toBeNull();
    expect(originOf([f('Python', 'b3')])?.flag).toBeNull();
    expect(originOf([f('範例大學 資訊工程系', 'b6')])?.flag).toBeNull();
  });

  it('跨兩個區塊、出處區塊不存在、多個欄位併成一格 → 標黃（跨區塊）', () => {
    expect(originOf([f('負責後端\n帶領三人團隊', 'b4')])).toEqual({
      blockId: 'b4',
      flag: 'cross_block',
    });
    expect(originOf([f('負責後端', 'b99')])?.flag).toBe('cross_block');
    expect(originOf([f('負責後端', 'b4'), f('帶領三人團隊', 'b5')])?.flag).toBe('cross_block');
  });

  it('含姓名或聯絡資料標示 → 標黃（個資），即使值包含於單一區塊', () => {
    expect(originOf([f('負責後端', 'b4', true)])).toEqual({ blockId: 'b4', flag: 'personal' });
  });

  it('沒有出處區塊（PDF 欄位）→ 不給出處', () => {
    expect(originOf([{ value: 'x' }])).toBeUndefined();
    expect(originOf([])).toBeUndefined();
  });

  it('正規化與照抄檢查相同：NFKC、去掉空白與零寬字元', () => {
    expect(normalizeForMatch('Ａ　b​c\n')).toBe('Abc');
  });
});

describe('formFromAiDraft 帶出處（D29）', () => {
  const draft: AiDraftLike = {
    personalInfo: [{ label: '姓名', value: f('林測試', 'b1') }],
    education: [f('範例大學', 'b6'), f('範例高中', 'b6')],
    experiences: [
      {
        company: f('範例科技股份有限公司', 'b1'),
        title: f('資深工程師', 'b1'),
        startDate: f('2019/03', 'b2'),
        endDate: f('至今', 'b2'),
        current: true,
        description: f('負責後端\n帶領三人團隊', 'b4'),
      },
    ],
    skills: [f('SQL', 'b3'), f('SQL', 'b3'), f('Python', 'b3'), f('Python', 'b4')],
    otherSections: [],
    discarded: [],
  };

  it('每格帶出處；學歷併列、出自不同區塊的同值技能 → 標黃（同一區塊重複不算）；PDF（不給 originOf）沒有出處', () => {
    const form = formFromAiDraft(draft, webOriginOf(BLOCKS));
    expect(form.info[0]?.origin).toEqual({ blockId: 'b1', flag: 'cross_block' });
    expect(form.info.find((r) => r.label === '學歷')?.origin?.flag).toBe('cross_block');
    expect(form.experiences[0]?.origins).toEqual({
      company: { blockId: 'b1', flag: null },
      title: { blockId: 'b1', flag: null },
      startDate: { blockId: 'b2', flag: null },
      endDate: { blockId: 'b2', flag: null },
      description: { blockId: 'b4', flag: 'cross_block' },
    });
    expect(form.skills).toEqual(['SQL', 'Python']);
    expect(form.skillOrigins).toEqual([
      { blockId: 'b3', flag: null },
      { blockId: 'b3', flag: 'cross_block' },
    ]);
    expect(flaggedCount(form)).toBe(4);
    const pdf = formFromAiDraft(draft);
    expect(pdf.info[0]?.origin).toBeUndefined();
    expect(pdf.experiences[0]?.origins).toBeUndefined();
    expect(pdf.skillOrigins).toBeUndefined();
    expect(flaggedCount(pdf)).toBe(0);
  });
});
