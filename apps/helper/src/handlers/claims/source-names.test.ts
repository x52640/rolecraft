// 事實項來源文件名稱（P1-T073）：claims.list／list_unassigned 附檔名與資料夾名稱，不含上層路徑。
import { createRepositories } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claim, openClaimsDb, P, type ClaimsDb } from './__fixtures__/claims-db.ts';
import { lastSegmentOf } from './source-names.ts';

let t: ClaimsDb;
beforeEach(() => {
  t = openClaimsDb();
  createRepositories(t.db).sourceDocuments.save({
    id: 'doc-1',
    folderPath: '/Users/me/projects/rolecraft',
    documentPath: 'docs/README.md',
    contentHash: 'a'.repeat(64),
    contentVersion: 1,
    authorizationStatus: 'authorized',
    importedAt: '2026-10-10T08:00:00.000Z',
  });
});
afterEach(() => t.cleanup());

const DOC_1 = { sourceDocumentId: 'doc-1', name: 'README.md', rootName: 'rolecraft' };

describe('事實項來源名稱', () => {
  it('claims.list 附來源文件的檔名與資料夾名稱，只有最後一段、不含上層路徑', async () => {
    const res = (await t.send({ op: 'claims.list', payload: { projectId: P } })) as {
      ok: boolean;
      sourceNames: unknown;
    };
    expect(res.ok).toBe(true);
    // 四個事實項都引用 doc-1：只列一次
    expect(res.sourceNames).toEqual([DOC_1]);
    expect(JSON.stringify(res)).not.toContain('/Users');
    expect(JSON.stringify(res)).not.toContain('docs/');
  });

  it('claims.list_unassigned 也附名稱；查不到的來源文件不列（畫面自行說明）', async () => {
    const orphan = claim('u-orphan');
    const excerpt = orphan.basis.sourceExcerpts[0];
    if (!excerpt) throw new Error('fixture');
    createRepositories(t.db).claims.save({
      ...orphan,
      basis: { ...orphan.basis, sourceExcerpts: [{ ...excerpt, sourceDocumentId: 'doc-gone' }] },
    });
    createRepositories(t.db).claims.save(claim('u-first'));
    const res = (await t.send({ op: 'claims.list_unassigned', payload: {} })) as {
      ok: boolean;
      sourceNames: unknown;
    };
    expect(res.ok).toBe(true);
    expect(res.sourceNames).toEqual([DOC_1]);
  });

  it('名稱只取最後一段；控制字元換掉、空的給「（未命名）」', () => {
    expect(lastSegmentOf('a/b/設計.md')).toBe('設計.md');
    expect(lastSegmentOf('C:\\work\\notes.txt')).toBe('notes.txt');
    expect(lastSegmentOf('/Users/me/proj/')).toBe('proj');
    expect(lastSegmentOf('a\u0007b.md')).toBe('a b.md');
    expect(lastSegmentOf('///')).toBe('（未命名）');
    expect([...lastSegmentOf('字'.repeat(500))]).toHaveLength(200);
  });
});
