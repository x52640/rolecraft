import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
} from '../export/export-version-repository.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import { assertNotInTransaction, releasePdfs, sweepOrphanPdfs } from '../export/pdf-cleanup.ts';
import type { FileStore } from '../files/file-store.ts';
import { decode } from '../repositories/json-table.ts';
import { transaction } from '../transaction.ts';
import { deletedMaterialsHeldBy } from './materials.ts';

export interface StorageSweep {
  /** 未投遞、含已刪素材副本而補刪的匯出版本（D19） */
  purgedExportVersionIds: string[];
  /** 刪掉的孤兒 PDF（雜湊不在任何匯出版本） */
  releasedPdfHashes: string[];
}

/** 啟動清掃的孤兒 PDF 寬限期：必須大於最長匯出時間（列印逾時 30 秒＋檢查），留足餘裕。 */
export const ORPHAN_PDF_GRACE_MS = 15 * 60 * 1000;

export interface StorageSweepOptions {
  /**
   * 啟動清掃（helper 開啟資料區時）設 true：孤兒 PDF 只刪修改時間早於 ORPHAN_PDF_GRACE_MS 的，
   * 避免刪到其他 helper 行程剛寫入、尚未寫資料列的檔。補刪的匯出版本（D19）的 PDF 一律立即刪。
   */
  readonly orphanGrace?: boolean;
  /** 現在時間（毫秒）；測試可注入 */
  readonly now?: () => number;
}

/**
 * 補救清掃（D19 縱深防禦）：本機輔助程式啟動時呼叫一次。
 * 1. 未投遞、卻保存了已刪素材副本的匯出版本整份刪除（素材若被繞過 deleteMaterial 刪掉，
 *    0003 觸發器仍會記入 deleted_materials，這裡補做 D19）。
 * 2. 清掉孤兒 PDF（刪檔失敗、程序中斷留下的檔案）。
 * deleteMaterial 與投遞紀錄 delete 結束時也會做第 2 步。不能在外層交易中呼叫。
 */
export function sweepStorage(
  db: DatabaseSync,
  fileStore: FileStore,
  options: StorageSweepOptions = {},
): StorageSweep {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '清掃儲存區');
  const purged = transaction(db, () => {
    const found: { id: string; pdfHash: string | null }[] = [];
    const rows = db.prepare('SELECT id, data FROM export_versions ORDER BY exported_at, id').all();
    for (const row of rows) {
      const version = decode(ExportVersion, row.data, `export_versions[${String(row.id)}]`);
      if (isExportVersionApplied(db, version.id)) continue;
      if (deletedMaterialsHeldBy(db, version).length === 0) continue;
      found.push({ id: version.id, pdfHash: deleteUnappliedExportVersion(db, version.id) });
    }
    return found;
  });
  // 補刪版本的 PDF 含已刪素材：不套寬限期，提交後立即刪（仍被其他版本共用的不刪）
  const purgedHashes = purged.flatMap((p) => (p.pdfHash === null ? [] : [p.pdfHash]));
  const released = releasePdfs(db, fileStore, purgedHashes);
  const orphans = sweepOrphanPdfs(db, fileStore, {
    graceMs: options.orphanGrace === true ? ORPHAN_PDF_GRACE_MS : 0,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return {
    purgedExportVersionIds: purged.map((p) => p.id),
    releasedPdfHashes: [...new Set([...released, ...orphans])].sort(),
  };
}
