import type { DatabaseSync } from 'node:sqlite';

import type { ApplicationRecord, ExportVersion } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';
import { readExportVersion } from '../export/export-version-repository.ts';
import type { FileStore } from '../files/file-store.ts';
import { readApplicationRecord } from './application-record-repository.ts';
import { deletedMaterialsHeldBy, type MaterialRef } from './materials.ts';

/**
 * 面試教練的輸入（R3、F09）：只讀投遞紀錄指向的匯出版本與其 PDF，
 * 不讀之後可能已修改的履歷版本、事實項、來源文件或職缺快照。
 */
export interface InterviewInput {
  applicationRecord: ApplicationRecord;
  exportVersion: ExportVersion;
  pdf: Uint8Array;
  /** 原件已被使用者刪除、只剩這份副本的素材（D19 明示） */
  deletedMaterials: MaterialRef[];
}

export function readInterviewInput(
  db: DatabaseSync,
  fileStore: FileStore,
  applicationRecordId: string,
): InterviewInput {
  const applicationRecord = readApplicationRecord(db, applicationRecordId);
  if (!applicationRecord) throw new StorageError(`找不到投遞紀錄：${applicationRecordId}`);
  const exportVersion = readExportVersion(db, applicationRecord.exportVersionId);
  if (!exportVersion) {
    throw new StorageError(`投遞紀錄 ${applicationRecordId} 指向的匯出版本不存在`);
  }
  const pdf = fileStore.get(exportVersion.pdfHash);
  if (!pdf) throw new StorageError(`匯出版本 ${exportVersion.id} 的 PDF 檔遺失`);
  return {
    applicationRecord,
    exportVersion,
    pdf,
    deletedMaterials: deletedMaterialsHeldBy(db, exportVersion),
  };
}
