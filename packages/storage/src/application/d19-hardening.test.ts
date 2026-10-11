import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { StorageError } from '../errors.ts';
import { createExportVersionRepository } from '../export/export-version-repository.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import * as publicApi from '../index.ts';
import { transaction } from '../transaction.ts';
import { readInterviewInput } from './interview-input.ts';
import { deleteMaterial } from './material-deletion.ts';
import { sweepStorage } from './storage-sweep.ts';

/** P1-T007 對抗驗證修正的回歸測試（含 PoC 情境）。 */

let t: ReturnType<typeof exportTestbed>;

beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const fileCount = () => fileStoreInternals(t.files).listHashes().length;

describe('deleteMaterial is the only public way to delete materials', () => {
  it('material repositories and the file store expose no delete', () => {
    for (const repo of [
      t.repos.sourceDocuments,
      t.repos.claims,
      t.repos.resumeVersions,
      t.repos.jobSnapshots,
    ]) {
      expect(Object.keys(repo)).not.toContain('delete');
    }
    expect(Object.keys(t.files)).not.toContain('delete');
    expect(Object.keys(publicApi)).not.toContain('fileStoreInternals');
    expect(Object.keys(publicApi)).not.toContain('releasePdfs');
    expect(Object.keys(publicApi)).toContain('deleteMaterial');
    expect(Object.keys(publicApi)).toContain('sweepStorage');
  });

  it('PoC: a material deleted by raw SQL is still recorded, disclosed and purged', () => {
    const unapplied = t.exportNow();
    const applied = t.exportNow();
    const record = t.apply(applied);
    t.db.prepare('DELETE FROM source_documents WHERE id = ?').run(t.source.id);
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);

    // 已投遞版本照樣明示
    expect(readInterviewInput(t.db, t.files, record.id).deletedMaterials).toEqual(
      expect.arrayContaining([
        { kind: 'source_document', id: t.source.id },
        { kind: 'claim', id: t.fact.id },
      ]),
    );
    // 啟動清掃補做 D19：未投遞版本與其 PDF 刪除，已投遞版本保留
    expect(sweepStorage(t.db, t.files)).toEqual({
      purgedExportVersionIds: [unapplied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.exports.get(applied.id)).not.toBeNull();
    expect(t.files.has(applied.pdfHash)).toBe(true);
    // 刪投遞紀錄時連帶清除
    expect(t.applications.delete(record.id)).toEqual({
      deleted: true,
      purgedExportVersionIds: [applied.id],
      releasedPdfHashes: [applied.pdfHash],
    });
  });

  it('records deletions of every material kind (trigger)', () => {
    t.db.prepare('DELETE FROM resume_versions WHERE id = ?').run(t.resume.id);
    t.db.prepare('DELETE FROM job_snapshots WHERE id = ?').run(t.job.id);
    const kinds = t.db.prepare('SELECT kind FROM deleted_materials ORDER BY kind').all();
    expect(kinds.map((r) => r.kind)).toEqual(['job_snapshot', 'resume_version']);
  });

  it('refuses to open when a deletion-record trigger is dropped', () => {
    t.db.exec('DROP TRIGGER claims_record_deleted');
    expect(() => createExportVersionRepository(t.db, t.files)).toThrow(StorageError);
  });
});

describe('create rejects deleted materials (D19)', () => {
  it('PoC: source document deleted → re-export rejected, no PDF written', () => {
    deleteMaterial(t.db, t.files, { kind: 'source_document', id: t.source.id });
    const before = fileCount();
    expect(() => t.exportNow()).toThrow(/source_document/);
    expect(fileCount()).toBe(before);
    expect(t.exports.list()).toEqual([]);
  });

  it('PoC: claim deleted → export citing it rejected', () => {
    const input = t.exportInput();
    deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(() => t.exports.create(input, t.pdf('x'))).toThrow(/claim/);
    expect(t.exports.list()).toEqual([]);
  });

  it('resume version and job snapshot deleted → rejected', () => {
    const input = t.exportInput();
    deleteMaterial(t.db, t.files, { kind: 'resume_version', id: t.resume.id });
    expect(() => t.exports.create(input, t.pdf('rv'))).toThrow(/resume_version/);
    deleteMaterial(t.db, t.files, { kind: 'job_snapshot', id: t.job.id });
    expect(() => t.exports.create(input, t.pdf('js'))).toThrow(/job_snapshot/);
    expect(fileCount()).toBe(0);
  });
});

describe('orphan PDFs (D19: no leftover PDF holding deleted material)', () => {
  it('PoC: PDF delete fails after commit → other PDFs still released, startup sweep cleans up', () => {
    const a = t.exportNow('A');
    const b = t.exportNow('B');
    const internals = fileStoreInternals(t.files);
    const original = internals.delete.bind(internals);
    internals.delete = (hash) => {
      if (hash === a.pdfHash) throw new Error('EPERM');
      return original(hash);
    };
    // 提交後刪檔失敗不讓操作失敗（P1-T052 對抗驗證）；刪不掉的留在待刪紀錄
    expect(
      deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id }).releasedPdfHashes,
    ).toEqual([b.pdfHash]);
    expect(t.exports.list()).toEqual([]);
    expect(t.files.has(b.pdfHash)).toBe(false); // 不因第一個失敗就停
    expect(t.files.has(a.pdfHash)).toBe(true);
    expect(() => sweepStorage(t.db, t.files, { orphanGrace: true })).toThrow(StorageError);

    internals.delete = original;
    expect(sweepStorage(t.db, t.files, { orphanGrace: true }).releasedPdfHashes).toEqual([
      a.pdfHash,
    ]);
    expect(fileCount()).toBe(0);
  });

  it('PoC: create inside an outer transaction is refused, nothing left behind', () => {
    const before = fileCount();
    expect(() =>
      transaction(t.db, () => {
        t.exportNow('Z');
      }),
    ).toThrow(/外層交易/);
    expect(fileCount()).toBe(before);
    expect(t.exports.list()).toEqual([]);
  });

  it('sweep removes only unreferenced PDFs', () => {
    const kept = t.exportNow();
    const orphan = t.files.put(t.pdf('orphan'));
    expect(sweepStorage(t.db, t.files)).toEqual({
      purgedExportVersionIds: [],
      releasedPdfHashes: [orphan.hash],
    });
    expect(t.exports.readPdf(kept)).toBeInstanceOf(Uint8Array);
    expect(() => transaction(t.db, () => sweepStorage(t.db, t.files))).toThrow(StorageError);
  });
});
