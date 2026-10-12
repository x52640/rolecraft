import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';

/**
 * 不可變性靠 migration 0002 的觸發器；觸發器被 DROP（DDL）時資料庫層擋不住，
 * 所以 export／application 模組開啟時先確認觸發器都還在，缺一個就拒絕使用。
 */
export const IMMUTABILITY_TRIGGERS = [
  'export_versions_insert_once',
  'export_versions_ledger_record',
  'export_versions_no_update',
  'export_versions_no_delete_applied',
  'export_version_ledger_no_update',
  'export_version_ledger_no_delete',
  'application_records_insert_target',
  'application_records_insert_once',
  'application_records_fixed_target',
  // 0003：素材被刪一律記入 deleted_materials（D19）
  'claims_record_deleted',
  'source_documents_record_deleted',
  'resume_versions_record_deleted',
  'job_snapshots_record_deleted',
  // 0009：照片素材（D19、D28）
  'photos_no_update',
  'photos_no_reuse_deleted_id',
  'photos_record_deleted',
  'export_versions_no_deleted_photo',
  // 0010：擋 REPLACE 覆寫照片（繞過刪除紀錄與 D19）
  'photos_insert_only_when_empty',
] as const;

export function assertImmutabilityGuards(db: DatabaseSync): void {
  const present = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((row) => String(row.name)),
  );
  const missing = IMMUTABILITY_TRIGGERS.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new StorageError(`匯出版本不可變性的觸發器遺失：${missing.join('、')}`);
  }
}
