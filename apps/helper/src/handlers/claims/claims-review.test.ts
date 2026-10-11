// 對抗驗證修正（P1-T023）：改字需重新確認、確認比對畫面狀態、否決順序。
import type { Claim, ResumeSection } from '@rolecraft/contracts';
import { checkExportReadiness } from '@rolecraft/domain';
import { createRepositories } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INVALID, P, claim, openClaimsDb, type ClaimsDb } from './__fixtures__/claims-db.ts';

let t: ClaimsDb;
beforeEach(() => {
  t = openClaimsDb();
});
afterEach(() => t.cleanup());

const save = (c: Claim) => createRepositories(t.db).claims.save(c);
const project = () => createRepositories(t.db).projectEvidence.get(P);

describe('修改後舊來源不再背書（R1）', () => {
  const metric: Claim = (() => {
    const base = claim('c-metric', { type: 'outcome_metric', text: '回應時間降低 30%' });
    delete base.completionStatus;
    base.basis.sourceExcerpts[0] = { ...base.basis.sourceExcerpts[0]!, text: '回應時間降低 30%' };
    return base;
  })();
  const section = (text: string): ResumeSection => ({
    id: 's1',
    origin: 'generated',
    text,
    citations: [{ claimId: 'c-metric' }],
    generatedCitations: [{ claimId: 'c-metric' }],
    sectionConfirmation: null,
    placement: { group: 'project' },
  });
  const exportable = (text: string) =>
    checkExportReadiness({
      sections: [section(text)],
      claims: [t.stored('c-metric')!],
      profile: null,
    });

  it('改數字後 → 待複核，匯出前檢查判不可用', async () => {
    save(metric);
    expect(exportable('回應時間降低 30%').ok).toBe(true);
    const res = await t.send({
      op: 'claims.update',
      payload: { claimId: 'c-metric', text: '回應時間降低 50%' },
    });
    expect(res).toEqual({ ok: true });
    expect(t.stored('c-metric')?.reviewStatus).toBe('needs_review');
    const check = exportable('回應時間降低 50%');
    expect(check.ok).toBe(false);
    expect(check.issues.map((i) => i.code)).toContain('claim_unusable');
  });

  it.each(['documented_done', 'planned', 'user_confirmed_done'] as const)(
    '%s 改字後退回未知',
    async (completionStatus) => {
      save(claim('c-x', { completionStatus }));
      await t.send({ op: 'claims.update', payload: { claimId: 'c-x', text: '支援 Word 匯出' } });
      expect(t.stored('c-x')).toMatchObject({
        completionStatus: 'unknown',
        reviewStatus: 'needs_review',
      });
    },
  );

  it('來源已移除的改字後維持來源已移除', async () => {
    await t.send({ op: 'claims.update', payload: { claimId: 'c-removed', text: '支援 Word' } });
    expect(t.stored('c-removed')?.reviewStatus).toBe('source_removed');
  });

  it('改字後重新確認 → 回到正常', async () => {
    await t.send({ op: 'claims.update', payload: { claimId: 'c-role', text: '負責後端與部署' } });
    const res = await t.send({
      op: 'claims.confirm',
      payload: { claimId: 'c-role', text: '負責後端與部署', expectedReviewStatus: 'needs_review' },
    });
    expect(res).toEqual({ ok: true });
    expect(t.stored('c-role')).toMatchObject({
      reviewStatus: 'normal',
      basis: { userConfirmation: { text: '負責後端與部署' } },
    });
  });
});

describe('確認比對畫面看到的複核狀態（R2）', () => {
  it('畫面看到正常、實際已是來源矛盾 → 拒絕且不寫入', async () => {
    save(claim('c-feature', { reviewStatus: 'source_conflict' }));
    const res = await t.send({
      op: 'claims.confirm',
      payload: {
        claimId: 'c-feature',
        text: '支援 PDF 匯出',
        completion: 'user_confirmed_done',
        expectedReviewStatus: 'normal',
      },
    });
    expect(res).toMatchObject(INVALID);
    expect(JSON.stringify(res)).toContain('複核狀態已改變');
    expect(t.stored('c-feature')).toMatchObject({
      reviewStatus: 'source_conflict',
      completionStatus: 'documented_done',
      basis: { userConfirmation: null },
    });
  });

  it('缺 expectedReviewStatus：schema 擋下', async () => {
    const res = await t.send({
      op: 'claims.confirm',
      payload: { claimId: 'c-role', text: '負責後端' },
    });
    expect(res).toMatchObject(INVALID);
    expect(t.stored('c-role')?.basis.userConfirmation).toBeNull();
  });
});

describe('否決順序（D19）', () => {
  it('刪素材失敗時專案引用加回原位置，清單仍看得到；重試可完成', async () => {
    const before = project()?.claimIds;
    t.db.exec(
      "CREATE TEMP TRIGGER block_claim_delete BEFORE DELETE ON claims BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    );
    const failed = await t.send({ op: 'claims.reject', payload: { claimId: 'c-role' } });
    expect(failed).toMatchObject({ ok: false, error: { code: 'internal_error' } });
    expect(project()?.claimIds).toEqual(before);
    expect(t.stored('c-role')).not.toBeNull();
    const listed = await t.send({ op: 'claims.list', payload: { projectId: P } });
    expect(JSON.stringify(listed)).toContain('c-role');

    t.db.exec('DROP TRIGGER block_claim_delete');
    expect(await t.send({ op: 'claims.reject', payload: { claimId: 'c-role' } })).toEqual({
      ok: true,
    });
    expect(t.stored('c-role')).toBeNull();
  });

  it('事實項已不存在但專案仍引用 → 清掉引用並回成功', async () => {
    createRepositories(t.db).projectEvidence.save({
      id: P,
      name: 'RoleCraft',
      summary: '',
      claimIds: ['c-role', 'gone-1'],
    });
    expect(await t.send({ op: 'claims.reject', payload: { claimId: 'gone-1' } })).toEqual({
      ok: true,
    });
    expect(project()?.claimIds).toEqual(['c-role']);
  });
});
