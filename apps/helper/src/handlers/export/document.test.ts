import { ResumeSection } from '@rolecraft/contracts';
import { validateDocument } from '@rolecraft/pdf-export';
import { describe, expect, it } from 'vitest';

import {
  citedSection,
  EXPERIENCE,
  profile,
  summarySection,
  without,
} from './__fixtures__/testbed.ts';
import { buildResumeDocument, HEADINGS, isPrintable } from './document.ts';

describe('contracts：段落歸屬與項目類型（additive）', () => {
  it('舊資料（沒有新欄位）仍合法', () => {
    const legacy = without(citedSection(), 'placement', 'itemKind');
    expect(ResumeSection.safeParse(legacy).success).toBe(true);
  });

  it('工作經歷歸屬必須帶公司、職稱、起始日期；未知群組與多帶欄位都拒絕', () => {
    const bad = [
      { group: 'experience', company: '甲' },
      { group: 'other' },
      { group: 'summary', company: '甲' },
      { group: 'experience', ...EXPERIENCE, title: '   ' },
    ];
    for (const placement of bad) {
      expect(ResumeSection.safeParse({ ...citedSection(), placement }).success).toBe(false);
    }
    expect(ResumeSection.safeParse({ ...citedSection(), itemKind: 'heading' }).success).toBe(false);
  });
});

describe('buildResumeDocument：Profile＋履歷各段 → 模板文件', () => {
  it('姓名、聯絡方式、公司職稱日期、技能取自 Profile；段落原文照印', () => {
    const built = buildResumeDocument(profile(), [summarySection(), citedSection()]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const doc = built.document;
    expect(doc.name).toBe('林小堃');
    expect(doc.headline).toBeUndefined();
    expect(doc.contacts).toEqual([
      { text: '0912-345-678' },
      { text: 'xiaokun.lin@example.com', href: 'mailto:xiaokun.lin@example.com' },
    ]);
    expect(doc.sections).toEqual([
      { heading: HEADINGS.summary, items: [{ kind: 'paragraph', text: '重視可觀測性與文件。' }] },
      {
        heading: HEADINGS.experience,
        items: [
          { kind: 'entry', title: '星河數位股份有限公司｜資深後端工程師', meta: '2021/03 – 至今' },
          { kind: 'bullet', text: '主導訂單系統拆分為 12 個服務。' },
        ],
      },
      { heading: HEADINGS.skills, items: [{ kind: 'paragraph', text: 'TypeScript・PostgreSQL' }] },
    ]);
    expect(validateDocument(doc)).toEqual([]);
    // 不在聯絡清單的欄位（生日）與 Profile 的舊經歷描述不印
    expect(JSON.stringify(doc)).not.toContain('1990');
    expect(JSON.stringify(doc)).not.toContain('舊描述');
  });

  it('經歷依 Profile 順序；沒有段落的經歷仍印出公司職稱日期', () => {
    const p = profile({
      experiences: [
        {
          company: '乙公司',
          title: '工程師',
          startDate: '2019/01',
          endDate: '2021/02',
          description: '',
        },
        { ...EXPERIENCE, endDate: null, description: '' },
      ],
    });
    const built = buildResumeDocument(p, [citedSection()]);
    if (!built.ok) throw new Error('應可組出');
    const experience = built.document.sections.find((s) => s.heading === HEADINGS.experience);
    expect(experience?.items).toEqual([
      { kind: 'entry', title: '乙公司｜工程師', meta: '2019/01 – 2021/02' },
      { kind: 'entry', title: '星河數位股份有限公司｜資深後端工程師', meta: '2021/03 – 至今' },
      { kind: 'bullet', text: '主導訂單系統拆分為 12 個服務。' },
    ]);
  });

  it('專案段落；省略 itemKind 視為一般段落', () => {
    const section = { ...summarySection('開源地址解析器。'), id: 's-p' };
    const built = buildResumeDocument(profile({ skills: [] }), [
      { ...section, placement: { group: 'project' } },
    ]);
    if (!built.ok) throw new Error('應可組出');
    expect(built.document.sections.map((s) => s.heading)).toEqual([
      HEADINGS.experience,
      HEADINGS.project,
    ]);
    expect(built.document.sections[1]?.items).toEqual([
      { kind: 'paragraph', text: '開源地址解析器。' },
    ]);
  });

  it('沒有歸屬的段落不能匯出（不猜放哪）', () => {
    const noPlacement = without(citedSection(), 'placement');
    expect(buildResumeDocument(profile(), [noPlacement])).toEqual({
      ok: false,
      problem: { reason: 'placement_missing', sectionId: 's-cited' },
    });
  });

  it('工作經歷對不到 Profile（公司、職稱、起始日期任一不同）不能匯出', () => {
    for (const change of [{ company: '別家' }, { title: '別職稱' }, { startDate: '2020/01' }]) {
      const section = citedSection({
        placement: { group: 'experience', ...EXPERIENCE, ...change },
      });
      expect(buildResumeDocument(profile(), [section])).toEqual({
        ok: false,
        problem: { reason: 'experience_not_found', sectionId: 's-cited' },
      });
    }
  });

  it('個人資料沒有姓名不能匯出', () => {
    expect(buildResumeDocument(profile({ personalInfo: { 姓名: '  ' } }), [])).toEqual({
      ok: false,
      problem: { reason: 'profile_name_missing' },
    });
  });

  it('R1 跳過的實質空白段落（含零寬字元）不印，也不算在印出段落裡', () => {
    // 沒有歸屬也沒關係：不印的段落不需要放哪
    const blank = without(citedSection({ id: 's-blank', text: ' \u200b\u3000\n' }), 'placement');
    expect(isPrintable(blank)).toBe(false);
    expect(isPrintable(citedSection())).toBe(true);
    const built = buildResumeDocument(profile(), [blank, citedSection()]);
    if (!built.ok) throw new Error('應可組出');
    expect(built.printedSections.map((s) => s.id)).toEqual(['s-cited']);
  });

  it('只寫一般網址的電子郵件、非 http 的個人網站不會變成連結', () => {
    const p = profile({
      personalInfo: { 姓名: '林小堃', 電子郵件: 'not-an-email', 個人網站: 'javascript:alert(1)' },
    });
    const built = buildResumeDocument(p, []);
    if (!built.ok) throw new Error('應可組出');
    expect(built.document.contacts).toEqual([
      { text: 'not-an-email' },
      { text: 'javascript:alert(1)' },
    ]);
    expect(validateDocument(built.document)).toEqual([]);
  });
});
