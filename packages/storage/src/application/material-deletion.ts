import type { DatabaseSync } from 'node:sqlite';

import { ExportVersion } from '@rolecraft/contracts';

import {
  deleteUnappliedExportVersion,
  isExportVersionApplied,
} from '../export/export-version-repository.ts';
import { assertNotInTransaction } from '../export/pdf-cleanup.ts';
import { assertImmutabilityGuards } from '../export/guards.ts';
import type { FileStore } from '../files/file-store.ts';
import { nowTimestamp } from '../ids.ts';
import { decode } from '../repositories/json-table.ts';
import { transaction } from '../transaction.ts';
import { holdsCopyOf, recordDeletedMaterial, type MaterialRef } from './materials.ts';
import { processPendingPdfDeletions, recordPendingPdfDeletions } from './pending-pdf-deletions.ts';

/** D19 刪除素材的結果：保留數＝retainedExportVersionIds.length，要明示給使用者。 */
export interface MaterialDeletion {
  /** 原件是否存在並已刪除 */
  materialDeleted: boolean;
  /** 未投遞、整份刪除的匯出版本 */
  deletedExportVersionIds: string[];
  /** 已投遞、保留的匯出版本（仍含該素材副本） */
  retainedExportVersionIds: string[];
  /** 這次實際刪掉的 PDF（只含這次釋出的；刪不掉的留在待刪紀錄，見 pending-pdf-deletions.ts） */
  releasedPdfHashes: string[];
}

/** 交易內的刪除結果：PDF 雜湊已記入待刪紀錄，提交後交給 finishMaterialDeletion 清檔。 */
export type MaterialDeletionInTransaction = Omit<MaterialDeletion, 'releasedPdfHashes'> & {
  pdfHashes: string[];
};

const MATERIAL_TABLES = {
  claim: 'claims',
  source_document: 'source_documents',
  resume_version: 'resume_versions',
  job_snapshot: 'job_snapshots',
  photo: 'photos',
} as const;

/**
 * D19 的資料列部分，必須在呼叫端的交易內：刪原件、記已刪素材、刪含其副本的未投遞匯出版本
 * （PDF 記入待刪紀錄），已投遞的保留並回報。給 replacePhoto 在同一交易接著寫新照片用。
 */
export function deleteMaterialRows(
  db: DatabaseSync,
  ref: MaterialRef,
): MaterialDeletionInTransaction {
  const table = MATERIAL_TABLES[ref.kind];
  const materialDeleted = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(ref.id).changes > 0;
  recordDeletedMaterial(db, ref, nowTimestamp());

  const deletedExportVersionIds: string[] = [];
  const retainedExportVersionIds: string[] = [];
  const pdfHashes: string[] = [];
  const rows = db.prepare('SELECT id, data FROM export_versions ORDER BY exported_at, id').all();
  for (const row of rows) {
    const version = decode(ExportVersion, row.data, `export_versions[${String(row.id)}]`);
    if (!holdsCopyOf(version, ref)) continue;
    if (isExportVersionApplied(db, version.id)) {
      retainedExportVersionIds.push(version.id);
    } else {
      const pdfHash = deleteUnappliedExportVersion(db, version.id);
      if (pdfHash !== null) pdfHashes.push(pdfHash);
      deletedExportVersionIds.push(version.id);
    }
  }
  recordPendingPdfDeletions(db, pdfHashes);
  return { materialDeleted, deletedExportVersionIds, retainedExportVersionIds, pdfHashes };
}

/**
 * 交易提交後只清這次釋出的 PDF；失敗的留在待刪紀錄（不拋：素材已刪，重試會變成找不到），
 * 啟動清掃立即重試、刪不掉擋啟動（裁定 #14）。
 */
export function finishMaterialDeletion(
  db: DatabaseSync,
  fileStore: FileStore,
  result: MaterialDeletionInTransaction,
): MaterialDeletion {
  const { pdfHashes, ...deletion } = result;
  const { released } = processPendingPdfDeletions(db, fileStore, pdfHashes);
  return { ...deletion, releasedPdfHashes: released };
}

/**
 * 刪除素材（D19）：同一交易內刪除原件、記下已刪素材、刪除含其副本的未投遞匯出版本；
 * 已投遞的保留並回報。之後刪掉保留版本的投遞紀錄時，該版本會一併刪除
 * （見 ApplicationRecordRepository.delete）。不能在外層交易中呼叫（會刪 PDF 檔）。
 * 原件被其他資料以外鍵引用（例如職缺快照仍有履歷版本）時拋錯並整個回滾。
 * 刪掉版本的 PDF 在同一交易記入待刪紀錄，提交後才刪檔；刪檔失敗不讓操作失敗（資料已提交），
 * 紀錄保留，啟動清掃立即重試、刪不掉擋啟動（裁定 #14）。
 */
export function deleteMaterial(
  db: DatabaseSync,
  fileStore: FileStore,
  ref: MaterialRef,
): MaterialDeletion {
  assertImmutabilityGuards(db);
  assertNotInTransaction(db, '刪除素材');
  const result = transaction(db, () => deleteMaterialRows(db, ref));
  return finishMaterialDeletion(db, fileStore, result);
}
