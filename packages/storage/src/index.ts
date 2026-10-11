/** storage 的公開入口：SQLite 連線、migration、核心物件 repository、檔案儲存區。 */
export const PACKAGE_NAME = '@rolecraft/storage';

export { openDatabase, type OpenDatabaseOptions, type OpenedDatabase } from './database.ts';
export {
  DEFAULT_MIGRATIONS_DIR,
  loadMigrations,
  migrate,
  type Migration,
  type MigrationResult,
} from './migrate.ts';
export { transaction } from './transaction.ts';
export { StorageError } from './errors.ts';
export { newId, nowTimestamp, sha256Hex } from './ids.ts';
export * from './repositories/index.ts';
export { createLocalFileStore, type FileStore, type StoredFile } from './files/file-store.ts';
export {
  createExportVersionRepository,
  type ExportVersionInput,
  type ExportVersionRepository,
} from './export/export-version-repository.ts';
export { assertImmutabilityGuards } from './export/guards.ts';
export {
  createApplicationRecordRepository,
  type ApplicationRecordChanges,
  type ApplicationRecordDeletion,
  type ApplicationRecordInput,
  type ApplicationRecordRepository,
} from './application/application-record-repository.ts';
export { deleteMaterial, type MaterialDeletion } from './application/material-deletion.ts';
export {
  OrphanPdfSweepError,
  sweepStorage,
  type StorageSweep,
  type StorageSweepOptions,
} from './application/storage-sweep.ts';
export {
  DATA_DIR_LOCK_FILE,
  tryAcquireDataDirLock,
  type AcquireDataDirLockOptions,
  type DataDirLock,
} from './lock/data-dir-lock.ts';
export { isMaterialDeleted, type MaterialKind, type MaterialRef } from './application/materials.ts';
export { readInterviewInput, type InterviewInput } from './application/interview-input.ts';
