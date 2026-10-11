import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import { deleteMaterial } from './material-deletion.ts';
import { recordPendingPdfDeletions } from './pending-pdf-deletions.ts';
import { ORPHAN_PDF_GRACE_MS, OrphanPdfSweepError, sweepStorage } from './storage-sweep.ts';

/** P1-T052 對抗驗證：D19 刪除提交後刪不掉的 PDF 記在待刪紀錄，啟動清掃擋啟動（裁定 #14）。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const afterGrace = () => Date.now() + ORPHAN_PDF_GRACE_MS + 60_000;
const startup = () => sweepStorage(t.db, t.files, { orphanGrace: true, now: afterGrace });
const pending = () =>
  t.db
    .prepare('SELECT pdf_hash FROM pending_pdf_deletions ORDER BY pdf_hash')
    .all()
    .map((r) => String(r.pdf_hash));

function failDeleteOf(...hashes: string[]) {
  const internals = fileStoreInternals(t.files);
  const original = internals.delete.bind(internals);
  return vi.spyOn(internals, 'delete').mockImplementation((hash) => {
    if (hashes.includes(hash)) throw new Error('EBUSY');
    return original(hash);
  });
}

function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('deleteMaterial 提交後刪檔失敗', () => {
  it('不拋錯、素材已刪；PDF 記在待刪紀錄，啟動清掃擋啟動（不是一般孤兒），恢復後刪掉並移除紀錄', () => {
    const v = t.exportNow();
    const spy = failDeleteOf(v.pdfHash);
    const result = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(result).toMatchObject({ deletedExportVersionIds: [v.id], releasedPdfHashes: [] });
    expect(t.repos.claims.get(t.fact.id)).toBeNull();
    expect(pending()).toEqual([v.pdfHash]);

    const error = caught(startup);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).not.toBeInstanceOf(OrphanPdfSweepError);
    expect(pending()).toEqual([v.pdfHash]);

    spy.mockRestore();
    expect(startup().releasedPdfHashes).toEqual([v.pdfHash]);
    expect(t.files.has(v.pdfHash)).toBe(false);
    expect(pending()).toEqual([]);
  });

  it('待刪 PDF 剛寫入（寬限期內）也立即處理', () => {
    const v = t.exportNow();
    const spy = failDeleteOf(v.pdfHash);
    deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    spy.mockRestore();
    expect(sweepStorage(t.db, t.files, { orphanGrace: true }).releasedPdfHashes).toEqual([
      v.pdfHash,
    ]);
  });

  it('只清這次釋出的 PDF：與這次無關、刪不掉的孤兒不碰、不讓刪除失敗', () => {
    const v = t.exportNow();
    const stuck = t.files.put(t.pdf('stuck'));
    const spy = failDeleteOf(stuck.hash);
    const result = deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    expect(result.releasedPdfHashes).toEqual([v.pdfHash]);
    expect(spy.mock.calls.map(([hash]) => hash)).not.toContain(stuck.hash);
    expect(t.files.has(stuck.hash)).toBe(true);
    expect(pending()).toEqual([]);
    // 一般孤兒照裁定 #14：刪不掉只記錄、照常啟動
    expect(caught(startup)).toBeInstanceOf(OrphanPdfSweepError);
  });
});

describe('刪投遞紀錄提交後刪檔失敗', () => {
  it('不拋錯、紀錄已刪；PDF 記在待刪紀錄，啟動清掃擋啟動，恢復後刪掉', () => {
    const v = t.exportNow();
    const record = t.apply(v);
    deleteMaterial(t.db, t.files, { kind: 'claim', id: t.fact.id });
    const spy = failDeleteOf(v.pdfHash);
    expect(t.applications.delete(record.id)).toEqual({
      deleted: true,
      purgedExportVersionIds: [v.id],
      releasedPdfHashes: [],
    });
    expect(t.applications.get(record.id)).toBeNull();
    expect(pending()).toEqual([v.pdfHash]);
    const error = caught(startup);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).not.toBeInstanceOf(OrphanPdfSweepError);
    spy.mockRestore();
    expect(startup().releasedPdfHashes).toEqual([v.pdfHash]);
    expect(pending()).toEqual([]);
  });
});

describe('待刪紀錄不刪仍被引用的 PDF', () => {
  it('同內容的匯出版本仍在：不刪檔，只移除紀錄', () => {
    const v = t.exportNow('same');
    t.db.exec('BEGIN');
    recordPendingPdfDeletions(t.db, [v.pdfHash]);
    t.db.exec('COMMIT');
    expect(startup().releasedPdfHashes).toEqual([]);
    expect(t.files.has(v.pdfHash)).toBe(true);
    expect(pending()).toEqual([]);
  });
});
