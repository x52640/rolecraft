// P1-T093 104 履歷頁區塊送出的提示（D31 驗收）：區塊照 apps/extension/src/sites/104/resume/expected-blocks.json
// 抄成合成區塊（去識別化、只取與 D31 相關的區塊，不跨套件 import）。一律用假 provider，不呼叫真實 CLI。
import { describe, expect, it } from 'vitest';

import { runWebResumeParse } from './run.ts';
import type { ResumeParseOutput } from './types.ts';
import { f, fakeDeps, h, inputsOf, li, p, prepareWeb } from './web-fixtures.test-helpers.ts';

const PAGE_104 = [
  p('林雨晴'), // b1
  p('細心負責樂於溝通協調主動積極數據導向思考者'), // b2
  p('Sunrise_晨曦烘焙股份有限公司門市營運主任'), // b3
  p('高雄市苓雅區5~6年工作經驗'), // b4
  p('負責三家門市的日常：https://example.com/portfolio'), // b5
  h(2, '工作經驗'), // b6
  p('門市營運主任'), // b7
  p('Sunrise_晨曦烘焙股份有限公司（餐飲業 30~100人）'), // b8
  p('高雄市苓雅區門市管理人員'), // b9
  p('2024/5~仍在職'), // b10
  li('負責三家門市的日常營運與排班，每週檢視來客數與客單價，調整人力配置。'), // b11
  p('海港生活百貨有限公司（百貨零售業 100~500人）'), // b12
  p('高雄市前鎮區營運管理師'), // b13
  p('青禾茶飲股份有限公司（餐飲業 100~500人）'), // b14
  p('台南市東區門市店長'), // b15
  p('2018/7~2021/2'), // b16
  p('範例餐飲集團（Sample Foods Co.)（餐飲業 500人以上）'), // b17
  p('台南市中西區儲備幹部'), // b18
  p('海外／新加坡門市服務人員'), // b19
  h(2, '求職條件'), // b20
  p('希望地點'), // b21
  p('高雄市、台南市東區、台南市北區、屏東縣屏東市、高雄市鳳山區'), // b22
  h(2, '專長'), // b23
  p('表，歸納：'), // b24
  p('https://example.com/portfolio'), // b25
  h(2, '自傳'), // b26
  p('林雨晴 Ivy Lin，高雄人。第一份打工在巷口的麵包店。'), // b27
  p('Ivy Lin, from Kaohsiung. My first part-time job was at a small bakery.'), // b28
  h(2, '專案成就'), // b29
  h(3, 'smalltown.tw 書店網站改版'), // b30
  p('2024/3~仍在進行'), // b31
];

const DISTRICT_LEVEL = [
  '高雄市苓雅區',
  '高雄市前鎮區',
  '高雄市鳳山區',
  '台南市東區',
  '台南市北區',
  '台南市中西區',
  '屏東縣屏東市',
  '苓雅區',
  '東區',
  '屏東市',
];

const EMPTY: ResumeParseOutput = { education: [], experiences: [], skills: [], sections: [] };
const prepared = () => prepareWeb(inputsOf(PAGE_104, { pageNames: ['林雨晴'] }));
const sentText = (id: string) => prepared().lines.find((l) => l.id === id)?.text ?? '';

describe('104 履歷頁區塊（D31 驗收）', () => {
  it('提示不含網址與「縣市＋鄉鎮市區」；只有縣市、地點以外的字照送', () => {
    const { prompt } = prepared();
    for (const s of ['http', 'www.', 'example.com', ...DISTRICT_LEVEL])
      expect(prompt).not.toContain(s);
    for (const s of [
      '高雄市',
      '5~6年工作經驗',
      '門市店長',
      '儲備幹部',
      '高雄人',
      '新加坡門市服務人員',
    ])
      expect(prompt).toContain(s);
    expect(sentText('b22')).toMatch(
      /^高雄市、〔個資\d+〕、〔個資\d+〕、〔個資\d+〕、〔個資\d+〕$/u,
    );
    expect(sentText('b15')).toMatch(/^〔個資\d+〕門市店長$/u);
  });

  it('模型照抄佔位字的欄位換回原文並標「含姓名或聯絡資料」；未含佔位字的不標', async () => {
    const output: ResumeParseOutput = {
      ...EMPTY,
      experiences: [
        {
          company: f('青禾茶飲股份有限公司', 'b14'),
          title: f(sentText('b15'), 'b15'),
          start: f('2018/7', 'b16'),
          end: f('2021/2', 'b16'),
          description: null,
        },
      ],
      sections: [
        { heading: f('求職條件', 'b20'), body: f(sentText('b22'), 'b22') },
        { heading: f('專長', 'b23'), body: f(sentText('b25'), 'b25') },
      ],
    };
    const input = prepared();
    const { deps, prompts } = fakeDeps({ text: JSON.stringify(output) });
    const result = await runWebResumeParse(input, deps);
    if (!result.ok) throw new Error(result.failure);
    expect(prompts.join('\n')).not.toContain('http');
    const [experience] = result.draft.experiences;
    expect(experience?.title?.value).toBe('台南市東區門市店長');
    expect(experience?.title?.containsPersonalData).toBe(true);
    expect(experience?.company?.containsPersonalData).toBe(false);
    const [wish, skills] = result.draft.otherSections;
    expect(wish?.body.value).toBe('高雄市、台南市東區、台南市北區、屏東縣屏東市、高雄市鳳山區');
    expect(wish?.body.containsPersonalData).toBe(true);
    expect(skills?.body.value).toBe('https://example.com/portfolio');
    expect(skills?.body.containsPersonalData).toBe(true);
  });

  it('本機預填的個人資料列與區塊原文不變', () => {
    const { personalInfo, lines } = prepared();
    expect(personalInfo.map((r) => [r.label, r.value.value])).toEqual([['姓名', '林雨晴']]);
    const originals = new Map(lines.map((l) => [l.id, l.original]));
    expect(originals.get('b5')).toBe('負責三家門市的日常：https://example.com/portfolio');
    expect(originals.get('b22')).toBe('高雄市、台南市東區、台南市北區、屏東縣屏東市、高雄市鳳山區');
  });
});
