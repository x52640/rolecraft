import { DatabaseSync } from 'node:sqlite';

import { migrate, type Migration, type MigrationResult } from './migrate.ts';

export interface OpenDatabaseOptions {
  /** 測試用：改用指定的 migration 清單 */
  migrations?: Migration[];
}

export interface OpenedDatabase {
  db: DatabaseSync;
  migration: MigrationResult;
}

/**
 * 開啟（或建立）本機 SQLite 資料庫並套用 migration。
 * 用 Node 內建 node:sqlite，不需原生模組編譯（ADR-0001）。
 */
export function openDatabase(path: string, options: OpenDatabaseOptions = {}): OpenedDatabase {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
    const migration = options.migrations ? migrate(db, options.migrations) : migrate(db);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
