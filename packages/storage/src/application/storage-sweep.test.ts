import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import { deleteMaterial } from './material-deletion.ts';
import { ORPHAN_PDF_GRACE_MS, sweepStorage } from './storage-sweep.ts';

/** P1-T040 對抗驗證：啟動清掃的孤兒寬限期，D19 刪除仍立即生效。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const afterGrace = () => Date.now() + ORPHAN_PDF_GRACE_MS + 60_000;

describe('sweepStorage 啟動清掃（orphanGrace）', () => {
  it('寬限期大於最長匯出時間（列印逾時 30 秒）且為 15 分鐘', () => {
    expect(ORPHAN_PDF_GRACE_MS).toBe(15 * 60 * 1000);
  });

  it('剛寫入的孤兒（可能是其他行程匯出中）不刪；超過寬限期的舊孤兒照刪', () => {
    const orphan = t.files.put(t.pdf('orphan'));
    expect(sweepStorage(t.db, t.files, { orphanGrace: true })).toEqual({
      purgedExportVersionIds: [],
      releasedPdfHashes: [],
    });
    expect(t.files.has(orphan.hash)).toBe(true);
    expect(sweepStorage(t.db, t.files, { orphanGrace: true, now: afterGrace })).toEqual({
      purgedExportVersionIds: [],
      releasedPdfHashes: [orphan.hash],
    });
    expect(t.files.has(orphan.hash)).toBe(false);
  });

  it('D19 補刪的未投遞版本，其 PDF 不受寬限期影響、立即刪；已投遞的保留', () => {
    const unapplied = t.exportNow();
    const applied = t.exportNow();
    t.apply(applied);
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    expect(sweepStorage(t.db, t.files, { orphanGrace: true })).toEqual({
      purgedExportVersionIds: [unapplied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.files.has(unapplied.pdfHash)).toBe(false);
    expect(t.files.has(applied.pdfHash)).toBe(true);
  });

  it('不帶選項（D19 刪除路徑同款）：剛寫入的孤兒立即刪', () => {
    const orphan = t.files.put(t.pdf('orphan'));
    expect(sweepStorage(t.db, t.files).releasedPdfHashes).toEqual([orphan.hash]);
  });

  it('deleteMaterial 仍立即刪剛匯出版本的 PDF', () => {
    const version = t.exportNow();
    const result = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(result.releasedPdfHashes).toEqual([version.pdfHash]);
    expect(t.files.has(version.pdfHash)).toBe(false);
  });
});

describe('sweepStorage 刪檔失敗', () => {
  it('補刪版本的 PDF 刪除失敗 → 孤兒清掃照跑，最後拋合併的 StorageError', () => {
    const unapplied = t.exportNow();
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    const orphan = t.files.put(t.pdf('orphan'));
    const internals = fileStoreInternals(t.files);
    const original = internals.delete.bind(internals);
    vi.spyOn(internals, 'delete').mockImplementation((hash) => {
      if (hash === unapplied.pdfHash) throw new Error('EBUSY');
      return original(hash);
    });
    let thrown: unknown;
    try {
      sweepStorage(t.db, t.files);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(StorageError);
    expect((thrown as StorageError).cause).toBeInstanceOf(AggregateError);
    expect(t.files.has(orphan.hash)).toBe(false);
    expect(t.files.has(unapplied.pdfHash)).toBe(true);
    // 刪檔失敗 → 資料列保留，下次清掃仍視為待補刪（P1-T044 對抗驗證）
    expect(t.db.prepare('SELECT 1 FROM export_versions WHERE id = ?').get(unapplied.id)).toEqual(
      expect.anything(),
    );
  });

  it('刪檔失敗後，寬限期內的下次啟動清掃仍立即重試：失敗照拋、恢復後刪掉（D19）', () => {
    const unapplied = t.exportNow();
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    const internals = fileStoreInternals(t.files);
    const original = internals.delete.bind(internals);
    const spy = vi.spyOn(internals, 'delete').mockImplementation((hash) => {
      if (hash === unapplied.pdfHash) throw new Error('EBUSY');
      return original(hash);
    });
    expect(() => sweepStorage(t.db, t.files, { orphanGrace: true })).toThrow(StorageError);
    expect(() => sweepStorage(t.db, t.files, { orphanGrace: true })).toThrow(StorageError);
    expect(t.files.has(unapplied.pdfHash)).toBe(true);
    spy.mockRestore();
    expect(sweepStorage(t.db, t.files, { orphanGrace: true })).toEqual({
      purgedExportVersionIds: [unapplied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.files.has(unapplied.pdfHash)).toBe(false);
  });

  it('補刪版本與其他版本共用同一 PDF：仍被引用就不刪檔', () => {
    const unapplied = t.exportNow('same');
    const applied = t.exportNow('same');
    expect(unapplied.pdfHash).toBe(applied.pdfHash);
    t.apply(applied);
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    const result = sweepStorage(t.db, t.files);
    expect(result).toEqual({ purgedExportVersionIds: [unapplied.id], releasedPdfHashes: [] });
    expect(t.files.has(applied.pdfHash)).toBe(true);
  });
});
