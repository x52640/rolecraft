import { describe, expect, it } from 'vitest';

import { buildDraft } from './draft/build-draft.ts';
import { findDates, headingKind } from './draft/rules.ts';
import { PACKAGE_NAME } from './index.ts';
import { assessQuality, disorderRatio, garbledRatio } from './pdf/quality.ts';
import type { ExtractedPage, RawPage, TextRun } from './types.ts';

function run(text: string, x = 50, y = 800): TextRun {
  return { text, x, y, width: text.length * 6, height: 11, rotated: false };
}

function page(lines: string[]): ExtractedPage {
  return {
    pageNumber: 1,
    width: 595,
    height: 842,
    columns: 1,
    lines: lines.map((text, i) => ({
      pageNumber: 1,
      column: 0,
      text,
      x: 50,
      y: 800 - i * 18,
      width: 100,
      height: 11,
    })),
  };
}

describe('@rolecraft/resume-import', () => {
  it('exposes its package name from the public entry', () => {
    expect(PACKAGE_NAME).toBe('@rolecraft/resume-import');
  });
});

describe('品質檢查', () => {
  const raw = (runs: TextRun[]): RawPage[] => [{ pageNumber: 1, width: 595, height: 842, runs }];

  it('亂碼（替代字元、私用區）比例過高 → garbled_text', () => {
    const pua = String.fromCodePoint(0xe001, 0xe002, 0xe003, 0xe004, 0xe005, 0xe006, 0xe007);
    const runs = [run(`\uFFFD\uFFFD${pua} abc`), run(`${pua} defghijklmn`)];
    expect(garbledRatio(runs)).toBeGreaterThan(0.2);
    expect(assessQuality(raw(runs))).toMatchObject({ reason: 'garbled_text' });
  });

  it('少量亂碼可以通過', () => {
    const runs = [run('Alice Chen senior engineer at Acme \uFFFD')];
    expect(assessQuality(raw(runs))).toBeNull();
  });

  it('文字太少 → no_text_layer', () => {
    expect(assessQuality(raw([run('p. 1')]))).toMatchObject({ reason: 'no_text_layer' });
  });

  it('多頁同一高度的文字不算疊字（只比較同一頁）', () => {
    const body = [run('Senior engineer at Acme', 50, 800), run('Built payment systems', 50, 780)];
    const pages: RawPage[] = [1, 2, 3].map((pageNumber) => ({
      pageNumber,
      width: 595,
      height: 842,
      runs: body.map((r) => ({ ...r })),
    }));
    expect(disorderRatio(pages)).toBe(0);
    expect(assessQuality(pages)).toBeNull();
  });

  it('同一頁真的疊字 → reading_order_unreliable', () => {
    const runs = [run('Senior engineer at Acme'), run('Built payment systems', 60)];
    expect(assessQuality(raw(runs))).toMatchObject({ reason: 'reading_order_unreliable' });
  });

  it('只有一頁疊字時，比例以全份字元計算', () => {
    const clean = (pageNumber: number): RawPage => ({
      pageNumber,
      width: 595,
      height: 842,
      runs: [0, 1, 2, 3].map((i) => run('Clean line of resume text', 50, 800 - i * 20)),
    });
    const messy: RawPage = {
      pageNumber: 5,
      width: 595,
      height: 842,
      runs: [run('Overlapped text'), run('Overlapped text', 55)],
    };
    const pages = [clean(1), clean(2), clean(3), clean(4), messy];
    expect(disorderRatio(pages)).toBeGreaterThan(0);
    expect(disorderRatio(pages)).toBeLessThan(0.2);
    expect(assessQuality(pages)).toBeNull();
  });
});

describe('欄位草稿規則（中文）', () => {
  it('辨識中文段落標題與日期', () => {
    expect(headingKind('工作經歷：')).toBe('experience');
    expect(headingKind('技能專長')).toBe('skills');
    expect(headingKind('學歷')).toBe('other');
    expect(findDates('2019年3月 至 2021年12月 在職')).toEqual(['2019年3月 至 2021年12月']);
    expect(findDates('2022/05 ~ 迄今')).toEqual(['2022/05 ~ 迄今']);
    expect(findDates('成立於 2015 年')).toEqual([]);
  });

  it('中文履歷產生草稿', () => {
    const draft = buildDraft([
      page([
        '姓名：王小明',
        '工作經歷',
        '2019/03 ~ 2021/12 ｜ 宏碁股份有限公司 ｜ 軟體工程師',
        '負責內部系統維護',
        '技能專長',
        'Java、Kotlin，SQL',
      ]),
    ]);
    expect(draft.name?.value).toBe('王小明');
    expect(draft.companies.map((f) => f.value)).toEqual(['宏碁股份有限公司']);
    expect(draft.titles.map((f) => f.value)).toEqual(['軟體工程師']);
    expect(draft.experiences.map((f) => f.source.lineIndex)).toEqual([2, 3]);
    expect(draft.skills.map((f) => f.value)).toEqual(['Java', 'Kotlin', 'SQL']);
  });

  it('沒有線索就不填，不捏造', () => {
    const draft = buildDraft([page(['王小明', '台北市', '喜歡登山與攝影'])]);
    expect(draft).toEqual({
      name: null,
      dates: [],
      companies: [],
      titles: [],
      experiences: [],
      skills: [],
    });
  });
});
