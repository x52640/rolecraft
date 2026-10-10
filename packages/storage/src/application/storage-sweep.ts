import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
} from '../export/export-version-repository.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import { assertNotInTransaction, sweepOrphanPdfs } from '../export/pdf-cleanup.ts';
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

/**
 * 補救清掃（D19 縱深防禦）：本機輔助程式啟動時呼叫一次。
 * 1. 未投遞、卻保存了已刪素材副本的匯出版本整份刪除（素材若被繞過 deleteMaterial 刪掉，
 *    0003 觸發器仍會記入 deleted_materials，這裡補做 D19）。
 * 2. 清掉孤兒 PDF（刪檔失敗、程序中斷留下的檔案）。
 * deleteMaterial 與投遞紀錄 delete 結束時也會做第 2 步。不能在外層交易中呼叫。
 */
export function sweepStorage(db: DatabaseSync, fileStore: FileStore): StorageSweep {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '清掃儲存區');
  const purgedExportVersionIds = transaction(db, () => {
    const purged: string[] = [];
    const rows = db.prepare('SELECT id, data FROM export_versions ORDER BY exported_at, id').all();
    for (const row of rows) {
      const version = decode(ExportVersion, row.data, `export_versions[${String(row.id)}]`);
      if (isExportVersionApplied(db, version.id)) continue;
      if (deletedMaterialsHeldBy(db, version).length === 0) continue;
      deleteUnappliedExportVersion(db, version.id);
      purged.push(version.id);
    }
    return purged;
  });
  return { purgedExportVersionIds, releasedPdfHashes: sweepOrphanPdfs(db, fileStore) };
}
