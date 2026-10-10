import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
} from '../export/export-version-repository.ts';
import { assertNotInTransaction, sweepOrphanPdfs } from '../export/pdf-cleanup.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import type { FileStore } from '../files/file-store.ts';
import { nowTimestamp } from '../ids.ts';
import { decode } from '../repositories/json-table.ts';
import { transaction } from '../transaction.ts';
import { holdsCopyOf, recordDeletedMaterial, type MaterialRef } from './materials.ts';

/** D19 刪除素材的結果：保留數＝retainedExportVersionIds.length，要明示給使用者。 */
export interface MaterialDeletion {
  /** 原件是否存在並已刪除 */
  materialDeleted: boolean;
  /** 未投遞、整份刪除的匯出版本 */
  deletedExportVersionIds: string[];
  /** 已投遞、保留的匯出版本（仍含該素材副本） */
  retainedExportVersionIds: string[];
  /** 這次實際刪掉的 PDF（含先前失敗留下、這次清掉的孤兒檔） */
  releasedPdfHashes: string[];
}

const MATERIAL_TABLES = {
  claim: 'claims',
  source_document: 'source_documents',
  resume_version: 'resume_versions',
  job_snapshot: 'job_snapshots',
} as const;

/**
 * 刪除素材（D19）：同一交易內刪除原件、記下已刪素材、刪除含其副本的未投遞匯出版本；
 * 已投遞的保留並回報。之後刪掉保留版本的投遞紀錄時，該版本會一併刪除
 * （見 ApplicationRecordRepository.delete）。不能在外層交易中呼叫（會刪 PDF 檔）。
 * 原件被其他資料以外鍵引用（例如職缺快照仍有履歷版本）時拋錯並整個回滾。
 */
export function deleteMaterial(
  db: DatabaseSync,
  fileStore: FileStore,
  ref: MaterialRef,
): MaterialDeletion {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '刪除素材');
  const result = transaction(db, () => {
    const table = MATERIAL_TABLES[ref.kind];
    const materialDeleted = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(ref.id).changes > 0;
    recordDeletedMaterial(db, ref, nowTimestamp());

    const deletedExportVersionIds: string[] = [];
    const retainedExportVersionIds: string[] = [];
    const rows = db.prepare('SELECT id, data FROM export_versions ORDER BY exported_at, id').all();
    for (const row of rows) {
      const version = decode(ExportVersion, row.data, `export_versions[${String(row.id)}]`);
      if (!holdsCopyOf(version, ref)) continue;
      if (isExportVersionApplied(db, version.id)) {
        retainedExportVersionIds.push(version.id);
      } else {
        deleteUnappliedExportVersion(db, version.id);
        deletedExportVersionIds.push(version.id);
      }
    }
    return { materialDeleted, deletedExportVersionIds, retainedExportVersionIds };
  });
  // 提交後清掉不再被引用的 PDF；連同先前刪檔失敗或中斷留下的孤兒檔一起清
  return { ...result, releasedPdfHashes: sweepOrphanPdfs(db, fileStore) };
}
