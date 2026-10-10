// claims.* 端到端：dispatch → handler → storage 實作（真實 SQLite，記憶體資料庫＋暫存檔案區）。
import path from 'node:path';

import type { Claim } from '@rolecraft/contracts';
import { createLocalFileStore, createRepositories } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../__fixtures__/requests.ts';
import { dispatch } from '../../bridge/dispatch.ts';
import { createServices } from '../../main.ts';
import { CONFIRMED_AT, INVALID, P, openClaimsDb, type ClaimsDb } from './__fixtures__/claims-db.ts';
import { createClaimsService } from './storage-service.ts';

let t: ClaimsDb;
beforeEach(() => {
  t = openClaimsDb();
});
afterEach(() => t.cleanup());

const send: ClaimsDb['send'] = (request) => t.send(request);
const stored: ClaimsDb['stored'] = (id) => t.stored(id);
const N = { expectedReviewStatus: 'normal' } as const;

describe('服務接線', () => {
  it('沒有 storage 時不接上，回 not_implemented', async () => {
    const { response } = await dispatch(
      { op: 'claims.list_projects', payload: {} },
      createServices(),
      recordingLogger(),
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
  });

  it('有 storage 時 createServices 接上 claims', async () => {
    const fileStore = createLocalFileStore(path.join(t.dir, 'other'));
    const wired = createServices({ db: t.db, fileStore });
    const { response } = await dispatch(
      { op: 'claims.list_projects', payload: {} },
      wired,
      recordingLogger(),
    );
    expect(response).toMatchObject({ ok: true, projects: [{ id: P }] });
  });
});

describe('讀取', () => {
  it('列出專案、專案的事實項、單一事實項', async () => {
    expect(await send({ op: 'claims.list_projects', payload: {} })).toMatchObject({
      ok: true,
      projects: [{ id: P, name: 'RoleCraft' }],
    });
    const list = (await send({ op: 'claims.list', payload: { projectId: P } })) as {
      claims: Claim[];
    };
    expect(list.claims.map((c) => c.id)).toEqual(['c-feature', 'c-role', 'c-review', 'c-removed']);
    expect(await send({ op: 'claims.get', payload: { claimId: 'c-feature' } })).toMatchObject({
      ok: true,
      claim: { id: 'c-feature', basis: { sourceExcerpts: [{ text: '已完成 PDF 匯出' }] } },
    });
  });

  it('不存在的專案或事實項：invalid_request，訊息不回填 ID', async () => {
    const a = await send({ op: 'claims.list', payload: { projectId: 'nope-123' } });
    const b = await send({ op: 'claims.get', payload: { claimId: 'nope-456' } });
    expect(a).toMatchObject(INVALID);
    expect(b).toMatchObject(INVALID);
    expect(JSON.stringify([a, b])).not.toMatch(/nope/);
  });
});

describe('確認（R1、D14）', () => {
  it('功能確認完成：時間由 helper 決定，記錄當下文字，狀態變使用者確認完成', async () => {
    const ok = await send({
      op: 'claims.confirm',
      payload: {
        claimId: 'c-feature',
        text: '支援 PDF 匯出',
        completion: 'user_confirmed_done',
        ...N,
      },
    });
    expect(ok).toEqual({ ok: true });
    expect(stored('c-feature')).toMatchObject({
      completionStatus: 'user_confirmed_done',
      basis: { userConfirmation: { confirmedAt: CONFIRMED_AT, text: '支援 PDF 匯出' } },
    });
  });

  it('呼叫端不能指定確認時間（多帶欄位被 schema 擋）', async () => {
    const res = await send({
      op: 'claims.confirm',
      payload: {
        claimId: 'c-feature',
        text: 'x',
        completion: 'user_confirmed_done',
        ...N,
        confirmedAt: '2020-01-01T00:00:00Z',
      },
    });
    expect(res).toMatchObject(INVALID);
    expect(stored('c-feature')?.basis.userConfirmation).toBeNull();
  });

  it('呼叫端不能把功能確認成「文件標示完成」或「未知」', async () => {
    for (const completion of ['documented_done', 'unknown']) {
      const res = await send({
        op: 'claims.confirm',
        payload: { claimId: 'c-feature', text: '支援 PDF 匯出', completion, ...N },
      });
      expect(res).toMatchObject(INVALID);
    }
    expect(stored('c-feature')?.basis.userConfirmation).toBeNull();
  });

  it('功能沒指定完成狀態、非功能帶完成狀態：拒絕且不寫入', async () => {
    expect(
      await send({
        op: 'claims.confirm',
        payload: { claimId: 'c-feature', text: '支援 PDF 匯出', ...N },
      }),
    ).toMatchObject(INVALID);
    expect(
      await send({
        op: 'claims.confirm',
        payload: { claimId: 'c-role', text: '負責後端', completion: 'user_confirmed_done', ...N },
      }),
    ).toMatchObject(INVALID);
    expect(stored('c-feature')?.basis.userConfirmation).toBeNull();
    expect(stored('c-role')?.basis.userConfirmation).toBeNull();
  });

  it('確認時一併修正文字：內容與確認文字都是修正後的', async () => {
    await send({
      op: 'claims.confirm',
      payload: { claimId: 'c-role', text: '負責後端與部署', ...N },
    });
    expect(stored('c-role')).toMatchObject({
      text: '負責後端與部署',
      basis: { userConfirmation: { text: '負責後端與部署' } },
    });
    expect(stored('c-role')?.completionStatus).toBeUndefined();
  });

  it('待複核經確認回到正常；來源已移除維持標示', async () => {
    const payload = { text: '支援 PDF 匯出', completion: 'planned' as const };
    const review = { claimId: 'c-review', expectedReviewStatus: 'needs_review', ...payload };
    const removed = { claimId: 'c-removed', expectedReviewStatus: 'source_removed', ...payload };
    expect(await send({ op: 'claims.confirm', payload: review })).toEqual({ ok: true });
    expect(await send({ op: 'claims.confirm', payload: removed })).toEqual({ ok: true });
    expect(stored('c-review')).toMatchObject({
      reviewStatus: 'normal',
      completionStatus: 'planned',
    });
    expect(stored('c-removed')?.reviewStatus).toBe('source_removed');
  });

  it('不存在的事實項：invalid_request', async () => {
    expect(
      await send({ op: 'claims.confirm', payload: { claimId: 'ghost', text: 'x', ...N } }),
    ).toMatchObject(INVALID);
  });

  it('預設確認時間是合法的 UTC 時間', async () => {
    const fileStore = createLocalFileStore(path.join(t.dir, 'f2'));
    const real = createClaimsService({ db: t.db, fileStore });
    await real.confirm({ claimId: 'c-role', text: '負責後端', ...N });
    expect(stored('c-role')?.basis.userConfirmation?.confirmedAt).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
    );
  });
});

describe('修改：原確認失效', () => {
  beforeEach(async () => {
    await send({
      op: 'claims.confirm',
      payload: {
        claimId: 'c-feature',
        text: '支援 PDF 匯出',
        completion: 'user_confirmed_done',
        ...N,
      },
    });
  });

  it('改內容 → 確認清除、轉待複核、使用者確認完成退回未知', async () => {
    expect(
      await send({
        op: 'claims.update',
        payload: { claimId: 'c-feature', text: '支援 PDF 與 Word 匯出' },
      }),
    ).toEqual({ ok: true });
    expect(stored('c-feature')).toMatchObject({
      text: '支援 PDF 與 Word 匯出',
      completionStatus: 'unknown',
      reviewStatus: 'needs_review',
      basis: { userConfirmation: null },
    });
  });

  it('內容沒變 → 確認保留', async () => {
    await send({ op: 'claims.update', payload: { claimId: 'c-feature', text: '支援 PDF 匯出' } });
    expect(stored('c-feature')?.basis.userConfirmation?.confirmedAt).toBe(CONFIRMED_AT);
  });
});

describe('否決', () => {
  it('刪除事實項、從專案移除，記入已刪素材', async () => {
    expect(await send({ op: 'claims.reject', payload: { claimId: 'c-role' } })).toEqual({
      ok: true,
    });
    expect(stored('c-role')).toBeNull();
    expect(createRepositories(t.db).projectEvidence.get(P)?.claimIds).not.toContain('c-role');
    expect(await send({ op: 'claims.get', payload: { claimId: 'c-role' } })).toMatchObject(INVALID);
    const row = t.db
      .prepare("SELECT kind FROM deleted_materials WHERE material_id = 'c-role'")
      .get();
    expect(row).toEqual({ kind: 'claim' });
  });

  it('否決後不能再確認或修改', async () => {
    await send({ op: 'claims.reject', payload: { claimId: 'c-role' } });
    expect(
      await send({ op: 'claims.confirm', payload: { claimId: 'c-role', text: '負責後端', ...N } }),
    ).toMatchObject(INVALID);
    expect(
      await send({ op: 'claims.update', payload: { claimId: 'c-role', text: '負責後端' } }),
    ).toMatchObject(INVALID);
    expect(stored('c-role')).toBeNull();
  });

  it('不存在的事實項：invalid_request', async () => {
    expect(await send({ op: 'claims.reject', payload: { claimId: 'ghost' } })).toMatchObject(
      INVALID,
    );
  });
});
