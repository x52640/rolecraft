// claims.list_unassigned（D23、P1-T061）：dispatch → handler → storage 實作（真實 SQLite）。
import type { Claim } from '@rolecraft/contracts';
import { createRepositories } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../__fixtures__/requests.ts';
import { dispatch } from '../../bridge/dispatch.ts';
import { claim, openClaimsDb, type ClaimsDb } from './__fixtures__/claims-db.ts';

let t: ClaimsDb;
beforeEach(() => {
  t = openClaimsDb();
  const repos = createRepositories(t.db);
  // 兩個未歸專案的事實項（fixture 的四項都在專案裡）
  repos.claims.save(claim('u-first', { text: '支援登入' }));
  repos.claims.save(claim('u-second', { text: '支援搜尋', reviewStatus: 'needs_review' }));
});
afterEach(() => t.cleanup());

async function unassigned(): Promise<Claim[]> {
  const res = (await t.send({ op: 'claims.list_unassigned', payload: {} })) as {
    ok: boolean;
    claims: Claim[];
  };
  expect(res.ok).toBe(true);
  return res.claims;
}
const ids = async () => (await unassigned()).map((c) => c.id);

describe('claims.list_unassigned', () => {
  it('有專案時只回不在任何專案裡的事實項，依建立順序，含狀態與來源片段', async () => {
    const claims = await unassigned();
    expect(claims.map((c) => c.id)).toEqual(['u-first', 'u-second']);
    expect(claims[0]?.basis.sourceExcerpts[0]?.text).toBe('已完成 PDF 匯出');
    expect(claims[1]?.reviewStatus).toBe('needs_review');
  });

  it('沒有任何專案時，全部事實項都算未歸專案', async () => {
    t.db.prepare('DELETE FROM project_evidence').run();
    expect(await ids()).toEqual([
      'c-feature',
      'c-role',
      'c-review',
      'c-removed',
      'u-first',
      'u-second',
    ]);
  });

  it('否決（已刪除素材）的事實項不再列出', async () => {
    expect(await t.send({ op: 'claims.reject', payload: { claimId: 'u-first' } })).toEqual({
      ok: true,
    });
    expect(await ids()).toEqual(['u-second']);
  });

  it('確認走既有路徑；確認後仍在未歸專案清單，狀態是 helper 更新後的', async () => {
    const ok = await t.send({
      op: 'claims.confirm',
      payload: {
        claimId: 'u-first',
        text: '支援登入',
        completion: 'planned',
        expectedReviewStatus: 'normal',
      },
    });
    expect(ok).toEqual({ ok: true });
    expect((await unassigned())[0]).toMatchObject({ id: 'u-first', completionStatus: 'planned' });
  });

  it('沒有資料區（未接 claims 服務）回 not_implemented', async () => {
    const { response } = await dispatch(
      { op: 'claims.list_unassigned', payload: {} },
      {},
      recordingLogger(),
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
  });
});
