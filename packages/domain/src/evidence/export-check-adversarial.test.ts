/** 對抗驗證回歸：不可用事實項擋匯出（協調者裁定）、數字漏抓的端對端情境。 */
import type { Claim, ResumeSection } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { checkExportReadiness } from './export-check.ts';
import { T, feature, generated, metric, profile } from './fixtures.test-helpers.ts';

function run(sections: ResumeSection[], claims: Claim[]) {
  return checkExportReadiness({ sections, claims, profile: profile() });
}

const confirmed = (s: ResumeSection): ResumeSection => ({
  ...s,
  sectionConfirmation: { confirmedAt: T, text: s.text },
});

const noBasis = { sourceExcerpts: [], userConfirmation: null };

describe('引用不可用的事實項：不論完成程度，逐段確認也不能放行', () => {
  const cases: [string, Claim][] = [
    ['待複核的功能', feature('c1', '搜尋功能', { reviewStatus: 'needs_review' })],
    ['來源矛盾的功能', feature('c1', '搜尋功能', { reviewStatus: 'source_conflict' })],
    [
      '來源已移除且未經使用者確認',
      feature('c1', '搜尋功能', {
        reviewStatus: 'source_removed',
        completionStatus: 'planned',
        basis: { ...feature('c1', 'x').basis, userConfirmation: null },
      }),
    ],
    ['沒有任何依據', feature('c1', '搜尋功能', { completionStatus: 'planned', basis: noBasis })],
    ['待複核的成果數字', { ...metric('c1', '降低延遲'), reviewStatus: 'needs_review' }],
  ];

  it.each(cases)('%s', (_label, claim) => {
    const statedCompletion = claim.type === 'feature' ? ('in_progress' as const) : undefined;
    const s = confirmed(generated('參與搜尋功能', [{ claimId: 'c1', statedCompletion }]));
    const r = run([s], [claim]);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      expect.objectContaining({
        check: 'claim_usability',
        code: 'claim_unusable',
        claimId: 'c1',
        resolvableBySectionConfirmation: false,
      }),
    ]);
  });

  it('來源已移除但使用者確認過的可以引用', () => {
    const claim = feature('c1', '搜尋功能', { reviewStatus: 'source_removed' });
    const r = run(
      [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [claim],
    );
    expect(r.ok).toBe(true);
  });

  it('只有使用者確認、沒有來源片段的事實項可以引用', () => {
    const claim = feature('c1', '搜尋功能', {
      basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '搜尋功能' } },
    });
    const r = run(
      [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [claim],
    );
    expect(r.ok).toBe(true);
  });
});

describe('數字漏抓的端對端情境（對抗驗證 PoC）', () => {
  const claim = feature('c1', '團隊 3 人，完成 5 個模組，30 人');
  const cite = [{ claimId: 'c1', statedCompletion: 'completed' as const }];

  it.each([
    ['管理十個專案，服務百餘家企業', ['number_unparseable', 'number_unsourced']],
    ['thousands of users', ['number_unparseable']],
    ['營收 5bn', ['number_unsourced']],
    ['轉換率提升三成', ['number_unsourced']],
    ['提升 30٪', ['number_unsourced']],
    ['IOO% 覆蓋率', ['number_unparseable']],
    ['ЗО% 轉換率', ['number_unparseable']],
    ['Ⅻ 倍', ['number_unparseable']],
    ['1萬5 用戶', ['number_unparseable']],
    ['1.000 users', ['number_unparseable']],
    ['提升 3ᅠ5%', ['number_unsourced']],
    ['提升 5 個百分點', ['number_unsourced']],
    ['延遲 100ms', ['number_unparseable']],
  ])('%s → 不能匯出', (text, expected) => {
    const r = run([generated(text, cite)], [claim]);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code).sort()).toEqual(expected);
  });

  it('寫法不同但有出處的仍可匯出', () => {
    const r = run(
      [generated('三人團隊完成五個模組，轉換率提升三成', [{ claimId: 'm1' }])],
      [metric('m1', '3 人團隊完成 5 個模組，轉換率提升 30%')],
    );
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it('「零售業」「第三方」不再被誤擋', () => {
    const r = run([generated('負責零售業客戶的第三方金流串接', cite)], [claim]);
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it('只含被清掉的數字字元的段落不當成空白', () => {
    const r = run([generated('①', cite)], [claim]);
    expect(r.issues.map((i) => i.code)).toEqual(['number_unparseable']);
  });
});
