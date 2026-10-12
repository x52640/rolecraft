// P1-T066 實測、對抗驗證與 codex review 屬實項的回歸測試。
import { describe, expect, it } from 'vitest';

import { page104, r } from '../../__fixtures__/layout104.ts';
import { mergedRowsRaw, realGeometry104 } from '../../__fixtures__/layout104-geometry.ts';
import { layoutPage } from '../../pdf/layout.ts';
import type { ExtractedPage } from '../../types.ts';
import { build104 } from './build-104.ts';
import { tagsIn } from './lines.ts';

const dates = (pages: ExtractedPage[]) =>
  (build104(pages)?.experiences ?? []).map((e) => [
    e.title?.value,
    e.startDate?.value ?? null,
    e.endDate?.value ?? null,
    e.current,
  ]);

describe('日期依幾何綁到同一列的職稱（實測座標）', () => {
  it('日期基線比職稱高 2～3pt 也不錯位；學歷日期不歸進任何經歷', () => {
    expect(dates(realGeometry104())).toEqual([
      ['資深專案經理', '2026/1', null, true],
      ['專案經理', '2016/6', '2025/12', false],
      ['產品專員', '2013/3', '2016/5', false],
      ['助理', '2012/7', '2013/2', false],
    ]);
  });

  it('日期出處指向右欄那一行', () => {
    const exps = build104(realGeometry104())?.experiences ?? [];
    expect(exps[3]?.startDate?.source).toEqual({ pageNumber: 3, lineIndex: 1 });
  });

  it('學歷段保留自己的日期', () => {
    const info = build104(realGeometry104())?.personalInfo ?? [];
    expect(info.find((row) => row.label === '學歷')?.value.value).toContain('2008/9~2012/6');
  });
});

describe('layoutPage 退回單欄的合併行', () => {
  it('「職稱⇥日期」「公司⇥年資」拆開後照常分類', () => {
    const page = layoutPage(mergedRowsRaw());
    expect(page.columns).toBe(1);
    expect(page.lines.map((l) => l.text)).toContain('資深工程師\t2020/1~仍在職');
    const [exp] = build104([page])?.experiences ?? [];
    expect(exp?.title?.value).toBe('資深工程師');
    expect(exp?.company?.value).toBe('範例軟體有限公司');
    expect(exp?.startDate?.value).toBe('2020/1');
    expect(exp?.current).toBe(true);
    expect(exp?.description?.value).toBe('• 開發內部工具。');
  });
});

describe('公司行換行', () => {
  it('括號未閉合時接下一行；之後的「X | Y」小字行都不進描述', () => {
    const pages = [
      page104(1, [
        r(23, 11.7, '學歷'),
        r(23, 10.5, '示範大學'),
        r(23, 11.7, '工作經驗'),
        r(68, 11.7, '工程師'),
        r(505, 9.4, '2018/1~2020/12', { column: 1, dy: -2 }),
        r(68, 10.5, '很長很長的範例國際股份有限公司（電腦軟體服務', { dy: 17 }),
        r(68, 10.5, '業 30~100人）'),
        r(68, 9.4, '軟體工程師 | 台北市'),
        r(68, 9.4, '遠端工作 | 彈性工時'),
        r(77, 10.5, '• 維護服務。'),
        r(23, 11.7, '自傳'),
      ]),
    ];
    const [exp] = build104(pages)?.experiences ?? [];
    expect(exp?.company?.value).toBe('很長很長的範例國際股份有限公司');
    expect(exp?.description?.value).toBe('• 維護服務。');
  });
});

describe('一般中文履歷不誤判成 104', () => {
  it('全文同字高、標題靠左、日期在右：沒有 104 特有訊號 → null', () => {
    const rows = [
      r(23, 12, '學歷'),
      r(23, 12, '工作經驗'),
      r(68, 12, '資深工程師'),
      r(450, 12, '2020/1~仍在職', { dy: 0 }),
      r(68, 12, '某某有限公司'),
      r(77, 12, '• 開發功能'),
      r(23, 12, '專長'),
      r(23, 12, '自傳'),
    ];
    expect(build104([page104(1, rows)])).toBeNull();
  });
});

describe('網址與標籤切法', () => {
  it('單獨的網址行不被切成「https」標籤', () => {
    const info = build104(realGeometry104())?.personalInfo ?? [];
    expect(info.map((row) => row.label)).toEqual(['姓名', '就業狀態', '學歷']);
  });

  it('C#、F#、C#.NET 不被切壞；標籤續行只併到下一個標籤前', () => {
    expect(tagsIn('#C# #F# #C#.NET #Go')).toEqual(['C#', 'F#', 'C#.NET', 'Go']);
    expect((build104(realGeometry104())?.skills ?? []).map((s) => s.value)).toEqual([
      '專案管理',
      'C#',
      'C#.NET',
      '跨部門溝通',
      '活動企劃',
      'F#',
    ]);
  });
});

describe('子職務日期留在描述（codex 複審）', () => {
  const entry = (subRows: ReturnType<typeof r>[]) => [
    page104(1, [
      r(23, 11.7, '學歷'),
      r(23, 10.5, '示範大學'),
      r(23, 11.7, '工作經驗'),
      r(68, 11.7, '專案經理'),
      r(505, 9.4, '2019/1~2020/12', { column: 1, dy: -2 }),
      r(68, 10.5, '範例資訊有限公司（電腦軟體服務業 30~100人）', { dy: 17 }),
      r(68, 9.4, '專案管理 | 台北市'),
      ...subRows,
      r(77, 10.5, '• 帶領三人小組。'),
      r(23, 11.7, '自傳'),
    ]),
  ];

  it('描述裡的「子職務 |⇥日期」不拆成主日期，經歷起訖不變', () => {
    const [exp] = build104(entry([r(68, 10.5, '會員專案 |\t2018/1~2021/6')]))?.experiences ?? [];
    expect([exp?.startDate?.value, exp?.endDate?.value]).toEqual(['2019/1', '2020/12']);
    expect(exp?.description?.value).toBe('會員專案 | 2018/1~2021/6\n• 帶領三人小組。');
  });

  it('「子職務 | 日期」小字行不被當成職務類別略過', () => {
    const [exp] = build104(entry([r(68, 9.4, '會員專案 | 2021/01 – 2022/06')]))?.experiences ?? [];
    expect(exp?.description?.value).toBe('會員專案 | 2021/01 – 2022/06\n• 帶領三人小組。');
    expect([exp?.startDate?.value, exp?.endDate?.value]).toEqual(['2019/1', '2020/12']);
  });
});
