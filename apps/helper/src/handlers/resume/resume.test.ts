// resume.*（除 generate）端到端：dispatch → handler → storage 實作（真實 SQLite，記憶體資料庫）。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createLocalFileStore } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../__fixtures__/requests.ts';
import { dispatch } from '../../bridge/dispatch.ts';
import { createServices } from '../../main.ts';
import {
  CLAIMS,
  CONFIRMED_AT,
  INVALID,
  JOB,
  V,
  generated,
  openResumeDb,
  version,
  type ResumeDb,
} from './__fixtures__/resume-db.ts';

let t: ResumeDb;
beforeEach(() => {
  t = openResumeDb();
});
afterEach(() => t.cleanup());

const ref = (sectionId: string) => ({ resumeVersionId: V, sectionId });
const op = (name: string, payload: Record<string, unknown>) => t.send({ op: name, payload });
const check = async () =>
  (await op('resume.check_export', { resumeVersionId: V })) as {
    ok: true;
    ready: boolean;
    issues: { sectionId: string; check: string; resolvableBySectionConfirmation: boolean }[];
    blockers: { sectionId: string; reason: string }[];
  };

describe('服務接線', () => {
  it('沒有 storage：resume.* 回 not_implemented', async () => {
    const { response } = await dispatch(
      { op: 'resume.list', payload: { jobSnapshotId: JOB } },
      createServices(),
      recordingLogger(),
    );
    expect(response).toMatchObject({ ok: false, error: { code: 'not_implemented' } });
  });

  it('有 storage：接上逐段操作與 generate；沒有選定可用的模型時不送出（invalid_request）', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-resume-'));
    try {
      const wired = createServices({ db: t.db, fileStore: createLocalFileStore(dir) });
      const send = async (request: Record<string, unknown>) =>
        (await dispatch(request, wired, recordingLogger())).response;
      expect(await send({ op: 'resume.list', payload: { jobSnapshotId: JOB } })).toMatchObject({
        ok: true,
        versions: [{ resumeVersionId: V }],
      });
      expect(await send({ op: 'resume.generate', payload: { jobSnapshotId: JOB } })).toMatchObject(
        INVALID,
      );
      expect(t.repos.workJobs.list()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('讀取', () => {
  it('get 回段落與原文對照（經歷段落＝Profile 經歷描述；其他段落沒有原文）', async () => {
    expect(await op('resume.get', { resumeVersionId: V })).toMatchObject({
      ok: true,
      version: { id: V, sections: [{ id: 's-exp' }, { id: 's-sum' }, { id: 's-bad' }] },
      originals: [{ sectionId: 's-exp', text: '負責網站前端開發。' }],
    });
  });

  it('找不到版本或職缺：invalid_request，訊息不回填請求內容', async () => {
    const res = await op('resume.get', { resumeVersionId: 'nope-123' });
    expect(res).toMatchObject(INVALID);
    expect(JSON.stringify(res)).not.toContain('nope-123');
    expect(await op('resume.list', { jobSnapshotId: 'nope-123' })).toMatchObject(INVALID);
  });
});

describe('接受、退回、刪除', () => {
  it('接受只接受措辭：decision 改 accepted，事實項與逐段確認都不動（接受≠確認事實）', async () => {
    expect(await op('resume.accept_section', ref('s-exp'))).toEqual({ ok: true });
    expect(t.section('s-exp')).toMatchObject({ decision: 'accepted', sectionConfirmation: null });
    expect(t.repos.claims.list()).toEqual(CLAIMS);
  });

  it('退回後不能匯出（blocker rejected）；不存在的段落回 invalid_request', async () => {
    expect(await op('resume.reject_section', ref('s-sum'))).toEqual({ ok: true });
    expect(t.section('s-sum')?.decision).toBe('rejected');
    expect((await check()).blockers).toContainEqual(
      expect.objectContaining({ sectionId: 's-sum', reason: 'rejected' }),
    );
    // 退回後可直接重新接受（等於撤回退回）
    expect(await op('resume.accept_section', ref('s-sum'))).toEqual({ ok: true });
    expect(t.section('s-sum')?.decision).toBe('accepted');
    expect((await check()).blockers.some((b) => b.sectionId === 's-sum')).toBe(false);
    expect(await op('resume.accept_section', ref('s-none'))).toMatchObject(INVALID);
  });

  it('刪除整段：段落與其引用一起移除', async () => {
    expect(await op('resume.delete_section', ref('s-bad'))).toEqual({ ok: true });
    expect(t.section('s-bad')).toBeUndefined();
    expect(t.repos.resumeVersions.get(V)?.sections.map((s) => s.id)).toEqual(['s-exp', 's-sum']);
  });
});

describe('自行編輯（R1 引用只增不刪）', () => {
  const edit = (sectionId: string, text: string, citations: object[], extra = {}) =>
    op('resume.edit_section', { ...ref(sectionId), text, citations, ...extra });

  it('只移除引用被拒，不寫入', async () => {
    expect(await edit('s-exp', '開發網站', [])).toMatchObject(INVALID);
    expect(t.section('s-exp')?.text).toBe('開發登入功能');
  });

  it('新增引用：必須是存在的事實項、不可重複；成功後回到待接受', async () => {
    await op('resume.accept_section', ref('s-exp'));
    const base = { claimId: 'c-doc', statedCompletion: 'in_progress' };
    expect(await edit('s-exp', '開發登入功能', [base, { claimId: 'ghost-1' }])).toMatchObject(
      INVALID,
    );
    expect(await edit('s-exp', '開發登入功能', [base, base])).toMatchObject(INVALID);
    expect(
      await edit('s-exp', '開發登入功能，載入時間縮短 40%', [base, { claimId: 'c-metric' }]),
    ).toEqual({ ok: true });
    expect(t.section('s-exp')).toMatchObject({
      text: '開發登入功能，載入時間縮短 40%',
      citations: [base, { claimId: 'c-metric' }],
      generatedCitations: [base],
      decision: 'pending',
    });
  });

  it('宣稱完成程度被調低（已完成→進行中、拿掉標示）：沒確認重看措辭就拒絕', async () => {
    const lowered = [{ claimId: 'c-done', statedCompletion: 'in_progress' }];
    const res = await edit('s-sum', '負責匯出 PDF', lowered);
    expect(res).toMatchObject(INVALID);
    expect((res as { error: { message: string } }).error.message).toContain('重看本段措辭');
    expect(await edit('s-sum', '負責匯出 PDF', [{ claimId: 'c-done' }])).toMatchObject(INVALID);
    expect(t.section('s-sum')?.citations).toEqual([
      { claimId: 'c-done', statedCompletion: 'completed' },
    ]);
    expect(
      await edit('s-sum', '正在開發匯出 PDF', lowered, { completionDowngradeAcknowledged: true }),
    ).toEqual({ ok: true });
    expect(t.section('s-sum')).toMatchObject({ text: '正在開發匯出 PDF', citations: lowered });
  });

  it('調高完成程度不需重看確認，但仍由匯出前檢查 2 把關', async () => {
    expect(
      await edit('s-exp', '開發登入功能', [{ claimId: 'c-doc', statedCompletion: 'completed' }]),
    ).toEqual({ ok: true });
    const { issues } = await check();
    expect(issues).toContainEqual(
      expect.objectContaining({ sectionId: 's-exp', check: 'completion' }),
    );
  });

  it('改字後舊的逐段確認失效', async () => {
    await edit('s-sum', '負責匯出 PDF，服務 7 個團隊', [
      { claimId: 'c-done', statedCompletion: 'completed' },
    ]);
    await op('resume.confirm_section', { ...ref('s-sum'), text: '負責匯出 PDF，服務 7 個團隊' });
    expect(t.section('s-sum')?.sectionConfirmation).not.toBeNull();
    await edit('s-sum', '負責匯出 PDF，服務 4 個團隊', [
      { claimId: 'c-done', statedCompletion: 'completed' },
    ]);
    expect(t.section('s-sum')?.sectionConfirmation).toBeNull();
  });
});

describe('逐段確認', () => {
  it('只放行檢查 1、3：數字無出處的段落確認後通過，時間由 helper 決定', async () => {
    await op('resume.edit_section', {
      ...ref('s-sum'),
      text: '負責匯出 PDF，服務 7 個團隊',
      citations: [{ claimId: 'c-done', statedCompletion: 'completed' }],
    });
    const before = await check();
    expect(before.issues.some((i) => i.sectionId === 's-sum' && i.check === 'numbers')).toBe(true);
    const text = '負責匯出 PDF，服務 7 個團隊';
    expect(await op('resume.confirm_section', { ...ref('s-sum'), text })).toEqual({ ok: true });
    expect(t.section('s-sum')?.sectionConfirmation).toEqual({ confirmedAt: CONFIRMED_AT, text });
    expect((await check()).issues.some((i) => i.sectionId === 's-sum')).toBe(false);
  });

  it('檢查 2 不通過（文件標示完成寫成已完成）不能用逐段確認放行', async () => {
    const res = await op('resume.confirm_section', {
      ...ref('s-bad'),
      text: '登入功能已上線，效能提升 50%',
    });
    expect(res).toMatchObject(INVALID);
    expect(t.section('s-bad')?.sectionConfirmation).toBeNull();
  });

  it('文字不是目前全文被拒；請求不能自帶確認時間', async () => {
    expect(await op('resume.confirm_section', { ...ref('s-sum'), text: '別的內容' })).toMatchObject(
      INVALID,
    );
    expect(
      await op('resume.confirm_section', {
        ...ref('s-sum'),
        text: '負責匯出 PDF',
        confirmedAt: T0,
      }),
    ).toMatchObject(INVALID);
    expect(t.section('s-sum')?.sectionConfirmation).toBeNull();
  });
});
const T0 = '2020-01-01T00:00:00.000Z';

describe('匯出前檢查', () => {
  it('初始：R1 問題（檢查 2 不可逐段確認）＋每段都待接受 → 不可匯出', async () => {
    const result = await check();
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        sectionId: 's-bad',
        check: 'completion',
        resolvableBySectionConfirmation: false,
      }),
    );
    expect(result.blockers.map((b) => [b.sectionId, b.reason])).toEqual([
      ['s-exp', 'pending'],
      ['s-sum', 'pending'],
      ['s-bad', 'pending'],
    ]);
  });

  it('刪掉問題段、其餘接受後可匯出；只接受不會讓 R1 問題消失', async () => {
    await op('resume.accept_section', ref('s-bad'));
    expect((await check()).issues.some((i) => i.sectionId === 's-bad')).toBe(true);
    await op('resume.delete_section', ref('s-bad'));
    await op('resume.accept_section', ref('s-exp'));
    await op('resume.accept_section', ref('s-sum'));
    expect(await check()).toEqual({ ok: true, ready: true, issues: [], blockers: [] });
  });

  it('缺段落歸屬、對不到經歷的段落不能匯出；空白段落不列', async () => {
    const noPlacement = generated('s-x', '負責匯出 PDF', [
      { claimId: 'c-done', statedCompletion: 'completed' },
    ]);
    delete noPlacement.placement;
    t.repos.resumeVersions.save(
      version([
        { ...noPlacement, decision: 'accepted' },
        generated('s-y', '負責匯出 PDF', [{ claimId: 'c-done', statedCompletion: 'completed' }], {
          placement: { group: 'experience', company: '丙公司', title: '工程師', startDate: '2020' },
          decision: 'accepted',
        }),
        generated('s-blank', '  ', [], { decision: 'rejected' }),
      ]),
    );
    const result = await check();
    expect(result.ready).toBe(false);
    expect(result.blockers.map((b) => [b.sectionId, b.reason])).toEqual([
      ['s-x', 'placement_missing'],
      ['s-y', 'experience_not_found'],
    ]);
  });
});
