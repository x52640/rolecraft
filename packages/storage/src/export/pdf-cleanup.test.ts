import { utimesSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fileStoreInternals } from '../files/file-store.ts';
import { exportTestbed } from './fixtures.test-support.ts';
import { sweepOrphanPdfs } from './pdf-cleanup.ts';

/** P1-T040 對抗驗證：多個 helper 行程時，清掃不可刪到其他行程剛寫入、尚未寫資料列的 PDF。 */

let t: ReturnType<typeof exportTestbed>;
beforeEach(() => {
  t = exportTestbed();
});
afterEach(() => t.cleanup());

const MINUTE = 60 * 1000;
const GRACE = 15 * MINUTE;
const later = (ms: number) => () => Date.now() + ms;

describe('sweepOrphanPdfs 寬限期', () => {
  it('預設無寬限期：剛寫入的孤兒立即刪（D19 刪除路徑行為不變）', () => {
    const orphan = t.files.put(t.pdf('orphan'));
    expect(sweepOrphanPdfs(t.db, t.files)).toEqual([orphan.hash]);
    expect(t.files.has(orphan.hash)).toBe(false);
  });

  it('有寬限期：新檔不刪，超過寬限期的舊孤兒照刪；被引用的永遠不刪', () => {
    const kept = t.exportNow();
    const orphan = t.files.put(t.pdf('orphan'));
    expect(sweepOrphanPdfs(t.db, t.files, { graceMs: GRACE })).toEqual([]);
    expect(t.files.has(orphan.hash)).toBe(true);
    expect(sweepOrphanPdfs(t.db, t.files, { graceMs: GRACE, now: later(GRACE - MINUTE) })).toEqual(
      [],
    );
    expect(sweepOrphanPdfs(t.db, t.files, { graceMs: GRACE, now: later(GRACE + MINUTE) })).toEqual([
      orphan.hash,
    ]);
    expect(t.files.has(orphan.hash)).toBe(false);
    expect(t.files.has(kept.pdfHash)).toBe(true);
  });

  it('同內容再次存入會更新修改時間：被重用的舊孤兒在寬限期內不刪', () => {
    const bytes = t.pdf('reused');
    const { hash } = t.files.put(bytes);
    const old = new Date(Date.now() - GRACE - MINUTE);
    utimesSync(path.join(t.dir, 'files', 'sha256', hash.slice(0, 2), hash), old, old);
    const internals = fileStoreInternals(t.files);
    expect(internals.modifiedAtMs(hash)).toBeLessThan(Date.now() - GRACE);
    // 另一行程匯出出同內容的 PDF：put 不重寫檔，但更新修改時間
    t.files.put(bytes);
    expect(internals.modifiedAtMs(hash)).toBeGreaterThan(Date.now() - MINUTE);
    expect(sweepOrphanPdfs(t.db, t.files, { graceMs: GRACE })).toEqual([]);
    expect(t.files.has(hash)).toBe(true);
  });

  it('modifiedAtMs：不存在回 null', () => {
    expect(fileStoreInternals(t.files).modifiedAtMs('0'.repeat(64))).toBeNull();
  });
});
