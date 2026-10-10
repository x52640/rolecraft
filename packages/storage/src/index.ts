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
