import type { ImportDraft } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_EXPERIENCE,
  emptyForm,
  formFromDraft,
  splitDateRange,
  toProfileInput,
  type ProfileForm,
} from './form-model.ts';

const at = (value: string, lineIndex: number, pageNumber = 1) => ({ value, pageNumber, lineIndex });

const DRAFT: ImportDraft = {
  name: at('王小明', 0),
  dates: [at('2019/03 ~ 至今', 2), at('2016.07 - 2019.02', 4)],
  companies: [at('宏碁股份有限公司', 2), at('Globex Corp.', 4)],
  titles: [at('資深工程師', 2)],
  experiences: [
    at('2019/03 ~ 至今 | 宏碁股份有限公司 | 資深工程師', 2),
    at('負責付款系統', 3),
    at('2016.07 - 2019.02 | Globex Corp.', 4),
    at('維護報表', 5),
    at('導入 CI', 6),
  ],
  skills: [at('TypeScript', 8), at('React', 8), at('TypeScript', 9)],
};

describe('splitDateRange', () => {
  it.each([
    ['2020/01 ~ Present', { startDate: '2020/01', endDate: '', current: true }],
    ['2019年3月 至 2021年5月', { startDate: '2019年3月', endDate: '2021年5月', current: false }],
    ['2017.06 - 2019.12', { startDate: '2017.06', endDate: '2019.12', current: false }],
    ['2018', { startDate: '2018', endDate: '', current: false }],
    ['2020-01', { startDate: '2020-01', endDate: '', current: false }],
    ['2020/01 - 某某公司', { startDate: '2020/01 - 某某公司', endDate: '', current: false }],
    ['2020-01 - 2021-03', { startDate: '2020-01', endDate: '2021-03', current: false }],
  ])('%s', (value, expected) => {
    expect(splitDateRange(value)).toEqual(expected);
  });
});

describe('formFromDraft', () => {
  it('以有公司的那一行為一段經歷，同一行的日期與職稱帶入，之後的行當描述', () => {
    const form = formFromDraft(DRAFT);
    expect(form.info).toEqual([{ label: '姓名', value: '王小明' }]);
    expect(form.experiences).toEqual([
      {
        company: '宏碁股份有限公司',
        title: '資深工程師',
        startDate: '2019/03',
        endDate: '',
        current: true,
        description: '負責付款系統',
      },
      {
        company: 'Globex Corp.',
        title: '',
        startDate: '2016.07',
        endDate: '2019.02',
        current: false,
        description: '維護報表\n導入 CI',
      },
    ]);
    expect(form.skills).toEqual(['TypeScript', 'React']);
  });

  it('描述延續到下一頁時一併帶入，到下一段公司為止', () => {
    const draft: ImportDraft = {
      ...DRAFT,
      dates: [at('2019/03 ~ 至今', 20), at('2016.07 - 2019.02', 2, 2)],
      companies: [at('宏碁股份有限公司', 20), at('Globex Corp.', 2, 2)],
      titles: [at('資深工程師', 20)],
      experiences: [
        at('2019/03 ~ 至今 | 宏碁股份有限公司 | 資深工程師', 20),
        at('負責付款系統', 21),
        at('帶領三人小組', 0, 2),
        at('導入監控', 1, 2),
        at('2016.07 - 2019.02 | Globex Corp.', 2, 2),
        at('維護報表', 3, 2),
      ],
    };
    const form = formFromDraft(draft);
    expect(form.experiences.map((e) => e.description)).toEqual([
      '負責付款系統\n帶領三人小組\n導入監控',
      '維護報表',
    ]);
  });

  it('找不到的欄位留空，不捏造', () => {
    const none: ImportDraft = {
      name: null,
      dates: [],
      companies: [],
      titles: [],
      experiences: [],
      skills: [],
    };
    expect(formFromDraft(none)).toEqual(emptyForm());
  });

  it('有 104 結構化草稿就用它預填（P1-T066），不用通用欄位', () => {
    const draft: ImportDraft = {
      ...DRAFT,
      structured: {
        layout: '104',
        personalInfo: [
          { label: '就業狀態', value: at('在職中', 3) },
          { label: '姓名', value: at('林測試', 0) },
          { label: '學歷', value: at('示範大學\n大學畢業', 9) },
        ],
        experiences: [
          {
            company: at('範例科技有限公司', 12),
            title: at('資深產品經理', 11),
            startDate: at('2021/1', 13),
            endDate: null,
            current: true,
            description: at('核心職責\n• 規劃路線圖', 15),
          },
          {
            company: null,
            title: at('行銷助理', 20),
            startDate: at('2015/2', 21),
            endDate: at('2016/6', 21),
            current: false,
            description: null,
          },
        ],
        skills: [at('SQL', 30), at(' SQL ', 31), at('產品管理', 30)],
      },
    };
    expect(formFromDraft(draft)).toEqual({
      info: [
        { label: '姓名', value: '林測試' },
        { label: '就業狀態', value: '在職中' },
        { label: '學歷', value: '示範大學\n大學畢業' },
      ],
      experiences: [
        {
          company: '範例科技有限公司',
          title: '資深產品經理',
          startDate: '2021/1',
          endDate: '',
          current: true,
          description: '核心職責\n• 規劃路線圖',
        },
        {
          company: '',
          title: '行銷助理',
          startDate: '2015/2',
          endDate: '2016/6',
          current: false,
          description: '',
        },
      ],
      skills: ['SQL', '產品管理'],
    });
  });
});

describe('toProfileInput', () => {
  const valid: ProfileForm = {
    info: [
      { label: '姓名', value: ' 王小明 ' },
      { label: 'Email', value: '' },
    ],
    experiences: [
      { ...EMPTY_EXPERIENCE, company: 'A', title: 'B', startDate: '2020', current: true },
    ],
    skills: ['Go', '  '],
  };

  it('去掉空白列；至今轉成 null', () => {
    expect(toProfileInput(valid)).toEqual({
      ok: true,
      profile: {
        personalInfo: { 姓名: '王小明' },
        experiences: [
          { company: 'A', title: 'B', startDate: '2020', endDate: null, description: '' },
        ],
        skills: ['Go'],
      },
    });
  });

  it('必填欄位缺漏逐條列出，不送出', () => {
    const result = toProfileInput({
      info: [
        { label: '', value: 'x' },
        { label: '姓名', value: 'a' },
        { label: '姓名', value: 'b' },
      ],
      experiences: [{ ...EMPTY_EXPERIENCE }],
      skills: [],
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        '個人資料第 1 列：欄位名稱不可空白',
        '個人資料「姓名」重複',
        '第 1 段經歷：公司不可空白',
        '第 1 段經歷：職稱不可空白',
        '第 1 段經歷：開始日期不可空白',
        '第 1 段經歷：請填結束日期或勾選「至今」',
      ],
    });
  });

  it('全空不送出', () => {
    expect(toProfileInput(emptyForm())).toMatchObject({ ok: false });
  });
});
