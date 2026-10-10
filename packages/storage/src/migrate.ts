import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import { StorageError } from './errors.ts';
import { nowTimestamp } from './ids.ts';
import { transaction } from './transaction.ts';

/**
 * Migration 機制：`src/migrations/` 內的 `NNNN_名稱.sql` 依版本號順序套用，
 * 已套用的記在 `schema_migrations`。後續 Task 只要「新增下一號檔案」，不必改任何既有檔。
 * 已套用的檔案內容被改動（checksum 不符）一律拒絕開啟，避免本機資料庫與程式不一致。
 */

export const DEFAULT_MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

const FILE_PATTERN = /^(\d{4})_([a-z0-9_-]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: number[];
  currentVersion: number;
}

/** 讀取資料夾內所有 migration，依版本排序；檔名不合規或版本重複就拋錯。 */
export function loadMigrations(dir: URL | string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const dirUrl = typeof dir === 'string' ? pathToFileURL(dir.endsWith('/') ? dir : `${dir}/`) : dir;
  const migrations: Migration[] = [];
  for (const file of readdirSync(dirUrl)) {
    if (!file.endsWith('.sql')) continue;
    const match = FILE_PATTERN.exec(file);
    if (!match?.[1] || !match[2]) {
      throw new StorageError(`migration 檔名不合規：${file}（應為 NNNN_名稱.sql）`);
    }
    const sql = readFileSync(new URL(file, dirUrl), 'utf8');
    migrations.push({
      version: Number(match[1]),
      name: match[2],
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]?.version === migrations[i - 1]?.version) {
      throw new StorageError(`migration 版本重複：${migrations[i]?.version}`);
    }
  }
  return migrations;
}

interface AppliedRow {
  version: number;
  checksum: string;
}

/** 套用尚未套用的 migration；每個 migration 一個交易，失敗就整個回滾並拋錯。 */
export function migrate(
  db: DatabaseSync,
  migrations: Migration[] = loadMigrations(),
): MigrationResult {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const appliedRows = db
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
    .all() as unknown as AppliedRow[];
  const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
  const known = new Set(migrations.map((m) => m.version));

  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new StorageError(
        `資料庫已套用版本 ${version}，但程式沒有對應 migration（程式比資料庫舊？）`,
      );
    }
  }

  const newlyApplied: number[] = [];
  for (const migration of migrations) {
    const checksum = applied.get(migration.version);
    if (checksum !== undefined) {
      if (checksum !== migration.checksum) {
        throw new StorageError(
          `migration ${migration.version}_${migration.name} 已套用後被修改；請改用新增 migration`,
        );
      }
      continue;
    }
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, migration.checksum, nowTimestamp());
    });
    newlyApplied.push(migration.version);
  }

  const last = migrations.at(-1);
  return { applied: newlyApplied, currentVersion: last ? last.version : 0 };
}
