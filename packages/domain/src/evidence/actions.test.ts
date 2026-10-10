import { describe, expect, it } from 'vitest';

import { acceptRevision, addCitation, confirmClaim, confirmSection } from './actions.ts';
import { checkSectionEdit } from './citation-edit.ts';
import { checkExportReadiness } from './export-check.ts';
import { T, feature, generated, metric, profile, section } from './fixtures.test-helpers.ts';

describe('接受修改稿', () => {
  it('只換措辭：引用保留、事實項狀態不變，寫成已完成仍被擋', () => {
    const claim = feature('c1', '搜尋功能', { completionStatus: 'documented_done' });
    const s = generated('規劃搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }]);
    const revised = acceptRevision(s, '完成搜尋功能');
    expect(revised.citations).toEqual(s.citations);
    const r = checkExportReadiness({ sections: [revised], claims: [claim], profile: profile() });
    expect(r.issues.map((i) => i.code)).toEqual(['completed_not_user_confirmed']);
  });

  it('文字改變時清除舊的逐段確認', () => {
    const s = section({ sectionConfirmation: { confirmedAt: T, text: '負責搜尋功能' } });
    expect(acceptRevision(s, '負責金流').sectionConfirmation).toBeNull();
    expect(acceptRevision(s, s.text).sectionConfirmation).not.toBeNull();
  });
});

describe('確認事實項', () => {
  it('文件標示完成 → 使用者確認完成，記錄時間與當下文字', () => {
    const claim = feature('c1', '搜尋功能', {
      completionStatus: 'documented_done',
      basis: { sourceExcerpts: [], userConfirmation: null },
    });
    const r = confirmClaim(claim, { confirmedAt: T, completion: 'user_confirmed_done' });
    expect(r).toMatchObject({
      ok: true,
      value: {
        completionStatus: 'user_confirmed_done',
        basis: { userConfirmation: { confirmedAt: T, text: '搜尋功能' } },
      },
    });
  });

  it('確認後可寫成已完成並匯出', () => {
    const claim = feature('c1', '搜尋功能', {
      completionStatus: 'planned',
      reviewStatus: 'needs_review',
    });
    const r = confirmClaim(claim, { confirmedAt: T, completion: 'user_confirmed_done' });
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.reviewStatus).toBe('normal');
    const s = generated('完成搜尋功能', [{ claimId: 'c1', statedCompletion: 'completed' }]);
    expect(checkExportReadiness({ sections: [s], claims: [r.value], profile: null }).ok).toBe(true);
  });

  it('確認時改內容，確認文字跟著更新', () => {
    const r = confirmClaim(feature('c1', '搜尋'), {
      confirmedAt: T,
      completion: 'user_confirmed_done',
      text: '全文搜尋',
    });
    expect(r).toMatchObject({
      ok: true,
      value: { text: '全文搜尋', basis: { userConfirmation: { text: '全文搜尋' } } },
    });
  });

  it('來源已移除維持標示', () => {
    const r = confirmClaim(feature('c1', '搜尋', { reviewStatus: 'source_removed' }), {
      confirmedAt: T,
      completion: 'user_confirmed_done',
    });
    expect(r).toMatchObject({ ok: true, value: { reviewStatus: 'source_removed' } });
  });

  it('功能沒指定完成狀態、非功能給完成狀態、時間格式錯 → 拒絕', () => {
    expect(confirmClaim(feature('c1', '搜尋'), { confirmedAt: T }).ok).toBe(false);
    expect(confirmClaim(metric('m1', '30%'), { confirmedAt: T, completion: 'planned' }).ok).toBe(
      false,
    );
    expect(confirmClaim(metric('m1', '30%'), { confirmedAt: 'yesterday' }).ok).toBe(false);
  });

  it('非功能類事實項可確認', () => {
    expect(confirmClaim(metric('m1', '30%'), { confirmedAt: T })).toMatchObject({ ok: true });
  });
});

describe('逐段確認', () => {
  it('記錄時間與該段全文', () => {
    const r = confirmSection(section({ text: '帶領團隊' }), T);
    expect(r).toMatchObject({
      ok: true,
      value: { sectionConfirmation: { confirmedAt: T, text: '帶領團隊' } },
    });
  });

  it('空白段落或時間格式錯 → 拒絕', () => {
    expect(confirmSection(section({ text: '  ' }), T).ok).toBe(false);
    expect(confirmSection(section(), 'now').ok).toBe(false);
  });
});

describe('引用編輯：只能增加不能移除', () => {
  const before = generated('完成搜尋', [{ claimId: 'c1', statedCompletion: 'completed' }]);

  it('增加引用合法', () => {
    const r = addCitation(before, { claimId: 'm1' });
    if (!r.ok) throw new Error(r.reason);
    expect(checkSectionEdit(before, r.value)).toEqual([]);
    expect(addCitation(r.value, { claimId: 'm1' }).ok).toBe(false);
  });

  it('改寫完成程度合法（同一事實項仍被引用）', () => {
    const after = {
      ...before,
      citations: [{ claimId: 'c1', statedCompletion: 'in_progress' as const }],
    };
    expect(checkSectionEdit(before, after)).toEqual([]);
  });

  it('移除引用被拒', () => {
    const after = { ...before, citations: [] };
    expect(checkSectionEdit(before, after)).toEqual([
      expect.objectContaining({ code: 'citation_removed', claimId: 'c1' }),
    ]);
  });

  it('移除引用再補一個別的引用（替換）也被拒', () => {
    const after = { ...before, citations: [{ claimId: 'm1' }] };
    expect(checkSectionEdit(before, after).map((v) => v.code)).toEqual(['citation_removed']);
  });

  it('改段落來源、改或刪生成紀錄、改 ID 被拒', () => {
    const tampered = { ...before, id: 'x', origin: 'user_written' as const };
    delete tampered.generatedCitations;
    expect(
      checkSectionEdit(before, tampered)
        .map((v) => v.code)
        .sort(),
    ).toEqual(['generated_citations_changed', 'origin_changed', 'section_id_changed']);
  });
});
