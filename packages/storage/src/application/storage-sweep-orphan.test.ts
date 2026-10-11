import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageError } from '../errors.ts';
import { exportTestbed } from '../export/fixtures.test-support.ts';
import { fileStoreInternals } from '../files/file-store.ts';
import { OrphanPdfSweepError, sweepStorage } from './storage-sweep.ts';

/** 擁有者裁定 #14：已清除素材（D19）的 PDF 刪不掉仍擋啟動；一般孤兒 PDF 刪不掉只記錄、照常啟動。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

/** 讓指定雜湊的刪檔失敗（其餘照常刪）。 */
function failDeleteOf(...hashes: string[]) {
  const internals = fileStoreInternals(t.files);
  const original = internals.delete.bind(internals);
  return vi.spyOn(internals, 'delete').mockImplementation((hash) => {
    if (hashes.includes(hash)) throw new Error('EBUSY');
    return original(hash);
  });
}

describe('sweepStorage：一般孤兒 PDF 刪不掉（裁定 #14）', () => {
  it('只有孤兒刪不掉：拋 OrphanPdfSweepError（仍是 StorageError），帶已完成的結果；其他孤兒照刪', () => {
    const stuck = t.files.put(t.pdf('stuck'));
    const other = t.files.put(t.pdf('other'));
    const spy = failDeleteOf(stuck.hash);
    const error = caught(() => sweepStorage(t.db, t.files));
    expect(error).toBeInstanceOf(OrphanPdfSweepError);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as OrphanPdfSweepError).sweep).toEqual({
      purgedExportVersionIds: [],
      releasedPdfHashes: [],
    });
    expect((error as Error).message).not.toContain(stuck.hash);
    expect(t.files.has(stuck.hash)).toBe(true);
    expect(t.files.has(other.hash)).toBe(false);
    // 下次清掃再試：恢復後刪掉
    spy.mockRestore();
    expect(sweepStorage(t.db, t.files).releasedPdfHashes).toEqual([stuck.hash]);
    expect(t.files.has(stuck.hash)).toBe(false);
  });

  it('D19 補刪成功、只有孤兒刪不掉：結果帶補刪的版本與其 PDF', () => {
    const unapplied = t.exportNow();
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    const stuck = t.files.put(t.pdf('stuck'));
    failDeleteOf(stuck.hash);
    const error = caught(() => sweepStorage(t.db, t.files));
    expect(error).toBeInstanceOf(OrphanPdfSweepError);
    expect((error as OrphanPdfSweepError).sweep).toEqual({
      purgedExportVersionIds: [unapplied.id],
      releasedPdfHashes: [unapplied.pdfHash],
    });
    expect(t.files.has(unapplied.pdfHash)).toBe(false);
  });

  it('補刪版本（已清除素材）的 PDF 刪不掉：一般 StorageError，不是 OrphanPdfSweepError（照樣擋啟動）', () => {
    const unapplied = t.exportNow();
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    failDeleteOf(unapplied.pdfHash);
    const error = caught(() => sweepStorage(t.db, t.files, { orphanGrace: true }));
    expect(error).toBeInstanceOf(StorageError);
    expect(error).not.toBeInstanceOf(OrphanPdfSweepError);
  });

  it('補刪版本與孤兒都刪不掉：一般 StorageError（D19 優先擋）', () => {
    const unapplied = t.exportNow();
    t.db.prepare('DELETE FROM claims WHERE id = ?').run(t.fact.id);
    const stuck = t.files.put(t.pdf('stuck'));
    failDeleteOf(unapplied.pdfHash, stuck.hash);
    const error = caught(() => sweepStorage(t.db, t.files));
    expect(error).toBeInstanceOf(StorageError);
    expect(error).not.toBeInstanceOf(OrphanPdfSweepError);
  });

  it('列舉檔案區失敗（不是刪檔失敗）：一般 StorageError（保守，照樣擋啟動）', () => {
    vi.spyOn(fileStoreInternals(t.files), 'listHashes').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const error = caught(() => sweepStorage(t.db, t.files));
    expect(error).toBeInstanceOf(StorageError);
    expect(error).not.toBeInstanceOf(OrphanPdfSweepError);
  });
});
