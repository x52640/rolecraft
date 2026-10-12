// 事實項來源文件名稱（P1-T073）：claims.list／list_unassigned 附授權資料夾內的相對路徑與資料夾名稱，
// 不含授權資料夾以上的路徑。
import type { SourceDocument } from '@rolecraft/contracts';
import { createRepositories } from '@rolecraft/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claim, openClaimsDb, P, type ClaimsDb } from './__fixtures__/claims-db.ts';
import { lastSegmentOf, relativeNameOf } from './source-names.ts';

const ROOT = '/Users/me/projects/rolecraft';

function doc(id: string, documentPath: string): SourceDocument {
  return {
    id,
    folderPath: ROOT,
    documentPath,
    contentHash: 'a'.repeat(64),
    contentVersion: 1,
    authorizationStatus: 'authorized',
    importedAt: '2026-10-10T08:00:00.000Z',
  };
}

/** 引用指定來源文件的未歸專案事實項。 */
function claimOn(id: string, sourceDocumentId: string) {
  const base = claim(id);
  const excerpt = base.basis.sourceExcerpts[0];
  if (!excerpt) throw new Error('fixture');
  return { ...base, basis: { ...base.basis, sourceExcerpts: [{ ...excerpt, sourceDocumentId }] } };
}

let t: ClaimsDb;
beforeEach(() => {
  t = openClaimsDb();
  createRepositories(t.db).sourceDocuments.save(doc('doc-1', 'docs/README.md'));
});
afterEach(() => t.cleanup());

const DOC_1 = { sourceDocumentId: 'doc-1', name: 'docs/README.md', rootName: 'rolecraft' };

async function names(op: 'claims.list' | 'claims.list_unassigned') {
  const payload = op === 'claims.list' ? { projectId: P } : {};
  const res = (await t.send({ op, payload })) as { ok: boolean; sourceNames: unknown };
  expect(res.ok).toBe(true);
  expect(JSON.stringify(res)).not.toContain('/Users');
  expect(JSON.stringify(res)).not.toContain('projects/');
  return res.sourceNames;
}

describe('事實項來源名稱', () => {
  it('claims.list 附授權資料夾內的相對路徑與資料夾名稱，不含資料夾以上的路徑', async () => {
    // 四個事實項都引用 doc-1：只列一次
    expect(await names('claims.list')).toEqual([DOC_1]);
  });

  it('claims.list_unassigned 也附名稱；查不到的來源文件不列（畫面自行說明）', async () => {
    const repos = createRepositories(t.db);
    repos.claims.save(claimOn('u-orphan', 'doc-gone'));
    repos.claims.save(claim('u-first'));
    expect(await names('claims.list_unassigned')).toEqual([DOC_1]);
  });

  it('同名、不同子資料夾的檔案名稱不同（回歸：對抗驗證）', async () => {
    const repos = createRepositories(t.db);
    repos.sourceDocuments.save(doc('doc-2023', '2023/週報.md'));
    repos.sourceDocuments.save(doc('doc-2024', '2024/週報.md'));
    repos.claims.save(claimOn('u-2023', 'doc-2023'));
    repos.claims.save(claimOn('u-2024', 'doc-2024'));
    expect(await names('claims.list_unassigned')).toEqual([
      { sourceDocumentId: 'doc-2023', name: '2023/週報.md', rootName: 'rolecraft' },
      { sourceDocumentId: 'doc-2024', name: '2024/週報.md', rootName: 'rolecraft' },
    ]);
  });

  it('相對路徑：絕對路徑去掉資料夾前綴、資料夾外只給最後一段、`..` 走出資料夾只給檔名、每段清理', () => {
    expect(relativeNameOf(`${ROOT}/a/設計.md`, ROOT)).toBe('a/設計.md');
    expect(relativeNameOf('/etc/secret/x.md', ROOT)).toBe('x.md');
    expect(relativeNameOf('../../x/y.md', ROOT)).toBe('y.md');
    expect(relativeNameOf('a\\b\\c.txt', ROOT)).toBe('a/b/c.txt');
    expect(relativeNameOf('a\u0007b/c\u0000d.md', ROOT)).toBe('a b/c d.md');
    expect(relativeNameOf('///', ROOT)).toBe('（未命名）');
    expect(relativeNameOf(`${'字'.repeat(500)}/x.md`, ROOT)).toBe(`${'字'.repeat(100)}/x.md`);
    const deep = Array.from({ length: 12 }, (_, i) => `d${String(i)}`).join('/');
    expect(relativeNameOf(`${deep}/x.md`, ROOT)).toBe('…/d5/d6/d7/d8/d9/d10/d11/x.md');
  });

  it('先用完整路徑判斷在不在資料夾內：資料夾外的目錄名不出現（回歸：codex 審查）', () => {
    const root = '/Users/me/project';
    // 資料夾名後接空白：修剪後會和資料夾同名
    expect(relativeNameOf('/Users/me/project /private/report.md', root)).toBe('report.md');
    // 含 `..`：正規化後已在資料夾外
    expect(relativeNameOf('/Users/me/project/../private/report.md', root)).toBe('report.md');
    expect(relativeNameOf('../private/report.md', root)).toBe('report.md');
    expect(relativeNameOf('/etc/secret/..', root)).toBe('（未命名）');
    // 前 100 字相同的不同目錄：截斷後會撞名
    const long = `/x/${'a'.repeat(100)}`;
    expect(relativeNameOf(`${long}b/private/report.md`, long)).toBe('report.md');
    // 正規化後仍在資料夾內的照常給相對路徑
    expect(relativeNameOf('/Users/me/project/a/../b/c.md', root)).toBe('b/c.md');
    expect(relativeNameOf('a/./../b/c.md', root)).toBe('b/c.md');
  });

  it('授權資料夾是根目錄時照樣給相對路徑，`..` 超出起點仍判不在內（回歸：codex 複審）', () => {
    expect(relativeNameOf('/2023/週報.md', '/')).toBe('2023/週報.md');
    expect(relativeNameOf('/2024/週報.md', '/')).toBe('2024/週報.md');
    expect(relativeNameOf('2023/週報.md', '/')).toBe('2023/週報.md');
    expect(relativeNameOf('/a/../b/c.md', '/')).toBe('b/c.md');
    expect(relativeNameOf('/../private/report.md', '/')).toBe('report.md');
    expect(relativeNameOf('../private/report.md', '/')).toBe('report.md');
    expect(relativeNameOf('C:\\2023\\週報.md', 'C:\\')).toBe('2023/週報.md');
    expect(relativeNameOf('D:\\private\\report.md', 'C:\\')).toBe('report.md');
    // 磁碟路徑不算在 POSIX 根目錄內
    expect(relativeNameOf('C:\\private\\report.md', '/')).toBe('report.md');
    // 無效（空或相對起點）的資料夾不當成根目錄
    expect(relativeNameOf('/private/report.md', '')).toBe('report.md');
    expect(relativeNameOf('/private/report.md', '.')).toBe('report.md');
  });

  it('資料夾名稱只取最後一段；控制字元換掉、空的給「（未命名）」', () => {
    expect(lastSegmentOf('/Users/me/proj/')).toBe('proj');
    expect(lastSegmentOf('C:\\work\\notes')).toBe('notes');
    expect(lastSegmentOf('a\u0007b')).toBe('a b');
    expect(lastSegmentOf('///')).toBe('（未命名）');
    expect([...lastSegmentOf('字'.repeat(500))]).toHaveLength(100);
  });
});
