import { describe, expect, it } from 'vitest';

import { page104, PAGE3_ROWS, r, sample104 } from '../../__fixtures__/layout104.ts';
import type { DraftField, ExtractedPage } from '../../types.ts';
import { buildDraft } from '../build-draft.ts';
import { build104 } from './build-104.ts';
import { companyName } from './experience.ts';
import { metaRanges } from './lines.ts';

const value = (field: DraftField | null | undefined): string | null => field?.value ?? null;
const source = (field: DraftField | null | undefined) => field?.source;

describe('104 版面辨識（P1-T066）', () => {
  const structured = build104(sample104());

  it('認出 104 版面並帶出個人資料（保留原標籤）、姓名、學歷', () => {
    expect(structured?.layout).toBe('104');
    const info = Object.fromEntries(
      (structured?.personalInfo ?? []).map((row) => [row.label, row.value.value]),
    );
    expect(info).toEqual({
      姓名: '林測試',
      個人網站: 'https://example.com/me',
      個人資料: '男 、 30歲 、 役畢',
      就業狀態: '在職中',
      主要手機: '0900-000-000',
      'E-mail': 'sample@example.com',
      通訊地址: '虛構市測試區範例路一段100號***',
      學歷: '示範大學\n資訊管理學系 大學畢業',
    });
    expect(structured?.personalInfo[0]?.value.source).toEqual({ pageNumber: 1, lineIndex: 0 });
  });

  it('經歷三段：公司去掉產業規模、職稱、日期（仍在職）、出處', () => {
    const exps = structured?.experiences ?? [];
    expect(exps).toHaveLength(3);
    expect(exps.map((e) => [value(e.title), value(e.company)])).toEqual([
      ['資深產品經理', '範例科技有限公司'],
      ['產品企劃專員', '虛構電商股份有限公司（Demo Labs)'],
      ['行銷助理', '測試行銷顧問'],
    ]);
    // 第一段有兩個日期區間：開始取最早，任一仍在職就是至今。
    expect(exps.map((e) => [value(e.startDate), value(e.endDate), e.current])).toEqual([
      ['2019/3', null, true],
      ['2016/7', '2018/12', false],
      ['2015/2', '2016/6', false],
    ]);
    expect(source(exps[0]?.title)).toEqual({ pageNumber: 1, lineIndex: 15 });
    // 右欄日期在閱讀順序排到段尾（索引 24），出處仍指向那一行。
    expect(source(exps[0]?.startDate)).toEqual({ pageNumber: 1, lineIndex: 24 });
    expect(source(exps[1]?.company)).toEqual({ pageNumber: 2, lineIndex: 5 });
  });

  it('描述：條列續行併回同一條、保留換行與 •、跨頁接續；職務類別與 #標籤不進描述', () => {
    const [first, second, third] = structured?.experiences ?? [];
    expect(value(first?.description)).toBe(
      [
        '核心職責',
        '• 規劃訂閱產品路線圖：協調 design 與 engineering 團隊，縮短上線時程。',
        '• 建立 A/B testing framework 與指標儀表板。',
        '主要成果',
        '• 轉換率提升 20%，續約率提升 8%。',
      ].join('\n'),
    );
    expect(source(first?.description)).toEqual({ pageNumber: 1, lineIndex: 18 });
    expect(value(second?.description)).toBe(
      [
        '負責會員系統與活動頁企劃。',
        '會員專案 | 2017/01 – 2018/06',
        '管理人數： 3 人',
        '• 導入會員分級，回購率提升 15%。',
      ].join('\n'),
    );
    expect(value(third?.description)).toBe('• 社群經營與素材製作。');
  });

  it('技能：專長段與經歷的 #標籤，去 #、去重，換行的標籤接回', () => {
    expect((structured?.skills ?? []).map((s) => s.value)).toEqual([
      'Product Roadmap',
      'SQL',
      '產品管理',
      '數據分析',
      'User Research',
      '活動企劃',
      '跨部門溝通',
    ]);
  });

  it('buildDraft 附上結構化草稿，通用欄位照舊產生', () => {
    const draft = buildDraft(sample104());
    expect(draft.structured?.experiences).toHaveLength(3);
    expect(draft.experiences.length).toBeGreaterThan(0);
  });

  it('找不到的欄位留空：沒有公司行、沒有日期', () => {
    const pages: ExtractedPage[] = [
      page104(1, [
        r(117, 14.1, '王範例'),
        r(23, 11.7, '學歷'),
        r(23, 10.5, '示範高中'),
        r(23, 11.7, '工作經驗'),
        r(68, 11.7, '工讀生'),
        r(505, 9.4, '2014/7~2014/8', { column: 1, dy: 0 }),
        r(68, 9.4, '門市人員 | 台北市', { dy: 12 }),
        r(68, 11.7, '志工'),
        r(77, 10.5, '• 協助活動。'),
        r(23, 11.7, '自傳'),
      ]),
    ];
    const exps = build104(pages)?.experiences ?? [];
    expect(exps).toHaveLength(2);
    expect(exps[0]).toMatchObject({ company: null, description: null, current: false });
    expect(exps[1]).toMatchObject({ startDate: null, endDate: null, company: null });
    expect(value(exps[1]?.description)).toBe('• 協助活動。');
  });
});

describe('認不出 104 版面 → 不產結構化草稿（走通用規則）', () => {
  it('只有標題、沒有經歷區塊樣式（職稱＋右欄日期）', () => {
    const pages = [
      page104(1, [
        r(23, 11.7, '學歷'),
        r(23, 11.7, '工作經驗'),
        r(68, 10.5, '2020/1~仍在職 某某公司'),
        r(23, 11.7, '專長'),
      ]),
    ];
    expect(build104(pages)).toBeNull();
    expect(buildDraft(pages).structured).toBeUndefined();
  });

  it('段落標題不夠多（缺工作經驗）', () => {
    expect(build104([page104(3, PAGE3_ROWS)])).toBeNull();
  });

  it('一般單欄履歷', () => {
    const pages = [
      page104(1, [
        r(50, 11, 'Name: Alice Chen'),
        r(50, 11, 'Work Experience'),
        r(50, 11, '2020/01 ~ Present | Acme Inc. | Senior Engineer'),
      ]),
    ];
    expect(buildDraft(pages).structured).toBeUndefined();
  });
});

describe('104 規則細節', () => {
  it.each([
    ['範例有限公司（電腦軟體服務業 30~100人）', '範例有限公司'],
    ['範例有限公司(其他製造業)', '範例有限公司'],
    ['範例有限公司（台北分公司）', '範例有限公司（台北分公司）'],
    ['範例有限公司', '範例有限公司'],
  ])('公司名 %s → %s', (text, expected) => {
    expect(companyName(text)).toBe(expected);
  });

  it.each([
    ['2020/1~仍在職', [{ start: '2020/1', end: null }]],
    ['2019/12~2021/3\t1年4個月', [{ start: '2019/12', end: '2021/3' }]],
    ['★\t3年2個月', []],
    ['99個月', []],
    ['會員專案 | 2017/01 – 2018/06', null],
    ['總年資 5~6年工作經驗', null],
  ])('右欄日期／年資行 %s', (text, expected) => {
    expect(metaRanges(text)).toEqual(expected);
  });
});
