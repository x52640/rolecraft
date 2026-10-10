import type { Claim, ResumeSection } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { checkExportReadiness } from './export-check.ts';
import { T, feature, generated, metric, profile, section } from './fixtures.test-helpers.ts';

function run(sections: ResumeSection[], claims: Claim[], p = profile()) {
  return checkExportReadiness({ sections, claims, profile: p });
}

const codes = (r: ReturnType<typeof run>) => r.issues.map((i) => i.code).sort();

const confirmed = (s: ResumeSection): ResumeSection => ({
  ...s,
  sectionConfirmation: { confirmedAt: T, text: s.text },
});

describe('R1 匯出前檢查：happy path', () => {
  it('引用使用者確認完成的功能寫成已完成，可匯出', () => {
    const r = run(
      [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [feature('c1', '搜尋功能')],
    );
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it('數字出現在引用的事實項中（寫法不同也算）', () => {
    const r = run(
      [generated('回應時間降低百分之三十', [{ claimId: 'm1' }])],
      [metric('m1', '回應時間降低 30%')],
    );
    expect(r.ok).toBe(true);
  });

  it('數字出現在已確認的個人資料中', () => {
    const r = run(
      [generated('2019 年加入 ACME', [{ claimId: 'm1' }])],
      [metric('m1', '加入 ACME')],
    );
    expect(r.ok).toBe(true);
  });

  it('空白段落（含零寬字元）不檢查', () => {
    expect(run([section({ text: ' ​ ' })], []).ok).toBe(true);
  });
});

describe('S9-7 檢查 2：不得把未確認的事寫成已完成', () => {
  it.each([
    ['計畫中', { completionStatus: 'planned' as const }],
    ['未知', { completionStatus: 'unknown' as const }],
    ['文件標示完成未經確認', { completionStatus: 'documented_done' as const }],
  ])('%s 寫成已完成 → 擋', (_label, overrides) => {
    const r = run(
      [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [feature('c1', '搜尋功能', overrides)],
    );
    expect(r.ok).toBe(false);
    expect(codes(r)).toEqual(['completed_not_user_confirmed']);
  });

  it.each(['needs_review', 'source_conflict'] as const)(
    '%s 即使狀態是確認完成也擋',
    (reviewStatus) => {
      const r = run(
        [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
        [feature('c1', '搜尋功能', { reviewStatus })],
      );
      expect(codes(r)).toEqual(['claim_unusable']);
    },
  );

  it('來源已移除但使用者已確認的可以寫成已完成（R2）', () => {
    const r = run(
      [generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [feature('c1', '搜尋功能', { reviewStatus: 'source_removed' })],
    );
    expect(r.ok).toBe(true);
  });

  it('確認完成但沒有確認紀錄，或確認後內容被改 → 擋', () => {
    const noRecord = feature('c1', '搜尋功能', {
      basis: { sourceExcerpts: [], userConfirmation: null },
    });
    const stale = feature('c2', '搜尋與推薦功能', {
      basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '搜尋功能' } },
    });
    const r = run(
      [
        generated('完成', [{ claimId: 'c1', statedCompletion: 'completed' }], { id: 'a' }),
        generated('完成', [{ claimId: 'c2', statedCompletion: 'completed' }], { id: 'b' }),
      ],
      [noRecord, stale],
    );
    // noRecord 完全沒有依據，另外也不能被引用
    expect(codes(r)).toEqual([
      'claim_unusable',
      'completed_confirmation_stale',
      'completed_confirmation_stale',
    ]);
  });

  it('檢查 2 不通過不能用逐段確認繞過', () => {
    const s = confirmed(
      generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }]),
    );
    const r = run([s], [feature('c1', '搜尋功能', { completionStatus: 'planned' })]);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({
      check: 'completion',
      resolvableBySectionConfirmation: false,
    });
  });

  it('引用不存在的事實項並寫成已完成：逐段確認也擋', () => {
    const s = confirmed(generated('完成', [{ claimId: 'ghost', statedCompletion: 'completed' }]));
    expect(codes(run([s], []))).toEqual(['completed_claim_not_found']);
  });

  it('引用功能卻不標完成程度 → 擋（防止省略欄位繞過）', () => {
    const s = confirmed(generated('完成搜尋功能', [{ claimId: 'c1' }]));
    const r = run([s], [feature('c1', '搜尋功能', { completionStatus: 'planned' })]);
    expect(codes(r)).toEqual(['completion_not_stated']);
  });

  it('沒有完成狀態的類型標成已完成 → 擋', () => {
    const r = run(
      [generated('完成', [{ claimId: 'm1', statedCompletion: 'completed' }])],
      [metric('m1', '降低延遲')],
    );
    expect(codes(r)).toEqual(['completion_not_applicable']);
  });

  it('寫成進行中／規劃中的計畫中事實項可匯出（措辭由使用者把關）', () => {
    const r = run(
      [generated('規劃搜尋功能', [{ claimId: 'c1', statedCompletion: 'planned' }])],
      [feature('c1', '搜尋功能', { completionStatus: 'planned' })],
    );
    expect(r.ok).toBe(true);
  });

  it('無引用段落混入已完成宣稱：沒有逐段確認不能匯出', () => {
    const r = run(
      [
        generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }], { id: 'a' }),
        section({ id: 'b', text: '並完成金流系統' }),
      ],
      [feature('c1', '搜尋功能')],
    );
    expect(r.issues).toEqual([
      expect.objectContaining({ sectionId: 'b', code: 'section_without_citation' }),
    ]);
  });

  it('非法事實項（schema 不過）視為不存在', () => {
    const bad = { ...feature('c1', '搜尋功能'), completionStatus: 'done' } as unknown as Claim;
    const r = run([generated('完成', [{ claimId: 'c1', statedCompletion: 'completed' }])], [bad]);
    expect(codes(r)).toEqual(['claim_not_found', 'completed_claim_not_found']);
  });

  it('事實項 ID 重複（一筆確認、一筆計畫中）視為不存在', () => {
    const r = run(
      [generated('完成', [{ claimId: 'c1', statedCompletion: 'completed' }])],
      [feature('c1', '搜尋功能'), feature('c1', '搜尋功能', { completionStatus: 'planned' })],
    );
    expect(codes(r)).toContain('completed_claim_not_found');
  });
});

describe('檢查 1、無引用與逐段確認', () => {
  it('引用不存在的事實項 → 擋；逐段確認後可匯出', () => {
    const s = generated('負責搜尋', [{ claimId: 'ghost' }]);
    expect(codes(run([s], []))).toEqual(['claim_not_found']);
    expect(run([confirmed(s)], []).ok).toBe(true);
  });

  it('使用者新寫的無引用段落：逐段確認後可匯出', () => {
    const s = section({ text: '帶領 5 人團隊' });
    expect(codes(run([s], []))).toEqual(['number_unsourced', 'section_without_citation']);
    expect(run([confirmed(s)], []).ok).toBe(true);
  });

  it('逐段確認後再改文字，確認失效', () => {
    const s = { ...confirmed(section({ text: '負責搜尋' })), text: '負責搜尋與金流' };
    expect(codes(run([s], []))).toEqual(['section_without_citation']);
  });

  it('不符 schema 的段落不能匯出，逐段確認也不行', () => {
    const bad = { ...confirmed(section()), origin: 'model' } as unknown as ResumeSection;
    expect(run([bad], []).issues[0]).toMatchObject({ code: 'invalid_section', sectionId: 's1' });
  });
});

describe('引用完整性：移除引用只能整段刪除', () => {
  it('生成段落移除了引用 → 擋，逐段確認也不行', () => {
    const s = confirmed(
      generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }], {
        citations: [],
      }),
    );
    const r = run([s], [feature('c1', '搜尋功能', { completionStatus: 'planned' })]);
    expect(codes(r)).toEqual(['citation_removed']);
  });

  it('生成段落缺少生成紀錄 → 擋（無法證明引用沒被移除）', () => {
    const s = confirmed(section({ origin: 'generated', text: '完成金流' }));
    expect(codes(run([s], []))).toEqual(['generated_citations_missing']);
  });

  it('生成時就沒有引用的段落：逐段確認後可匯出', () => {
    const s = generated('熱愛學習新技術', []);
    expect(codes(run([s], []))).toEqual(['section_without_citation']);
    expect(run([confirmed(s)], []).ok).toBe(true);
  });

  it('把生成段落改標成使用者新寫但仍保留生成紀錄 → 仍檢查引用', () => {
    const s = confirmed(
      generated('完成搜尋', [{ claimId: 'c1', statedCompletion: 'completed' }], {
        origin: 'user_written',
        citations: [],
      }),
    );
    expect(codes(run([s], []))).toEqual(['citation_removed']);
  });
});

describe('S9-7 檢查 3：數字要有出處（繞過情境）', () => {
  const claims = [metric('m1', '回應時間降低 30%')];
  const cite = [{ claimId: 'm1' }];

  it.each([
    '回應時間降低 40%',
    '回應時間降低４０％',
    '回應時間降低百分之四十',
    '回應時間降低 forty percent',
    '回應時間降低 4​0%',
    '回應時間降低 3O%'.replace('3O', '4O'),
    '服務 3 萬名使用者',
    '服務三萬名使用者',
    '服務數萬名使用者',
    '於二〇二四年上線',
    '服務 30 人', // 30 不是 30%
  ])('找不到出處：%s', (text) => {
    const r = run([generated(text, cite)], claims);
    expect(r.ok).toBe(false);
    expect(r.issues.every((i) => i.check === 'numbers')).toBe(true);
  });

  it('無法辨識的數字寫法一律擋', () => {
    expect(codes(run([generated('服務 ٣٠ 人', cite)], claims))).toContain('number_unparseable');
  });

  it('數字只出現在未引用的事實項中 → 擋', () => {
    const r = run([generated('降低 50%', cite)], [...claims, metric('m2', '降低 50%')]);
    expect(codes(r)).toEqual(['number_unsourced']);
  });

  it('個人資料未經使用者確認時不算出處', () => {
    const r = run([generated('2019 年加入', cite)], claims, profile({ pdfParseConfirmed: false }));
    expect(codes(r)).toEqual(['number_unsourced']);
  });

  it('結果指出哪段、哪個數字', () => {
    const r = run([generated('降低 40%', cite, { id: 'sec-9' })], claims);
    expect(r.issues[0]).toMatchObject({
      sectionId: 'sec-9',
      number: '40%',
      resolvableBySectionConfirmation: true,
    });
  });

  it('檢查 3 不通過可用逐段確認處理', () => {
    expect(run([confirmed(generated('降低 40%', cite))], claims).ok).toBe(true);
  });
});
