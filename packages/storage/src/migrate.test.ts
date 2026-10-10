import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { tempDatabase } from './__fixtures__/entities.ts';
import { openDatabase } from './database.ts';
import { StorageError } from './errors.ts';
import { DEFAULT_MIGRATIONS_DIR, loadMigrations, migrate } from './migrate.ts';
import { transaction } from './transaction.ts';

const CORE_TABLES = [
  'claim_sources',
  'claims',
  'job_snapshots',
  'message_drafts',
  'profiles',
  'project_evidence',
  'provider_connections',
  'resume_versions',
  'run_check_records',
  'source_documents',
  'work_jobs',
  'work_units',
];

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-mig-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 把正式 migration 複製到暫存資料夾，方便模擬「後續 Task 新增檔案」。 */
function copyOfRealMigrations(): string {
  const dir = tempDir();
  const src = fileURLToPath(DEFAULT_MIGRATIONS_DIR);
  for (const file of readdirSync(src)) copyFileSync(path.join(src, file), path.join(dir, file));
  return dir;
}

function tableNames(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => String(row.name))
    .sort();
}

describe('migrate', () => {
  it('rebuilds the full schema from an empty database file', () => {
    const t = tempDatabase();
    cleanups.push(t.cleanup);
    expect(t.migration.applied).toEqual([1]);
    expect(t.migration.currentVersion).toBe(1);
    expect(tableNames(t.db)).toEqual([...CORE_TABLES, 'schema_migrations'].sort());
    expect(t.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });

  it('is idempotent when reopened', () => {
    const t = tempDatabase();
    cleanups.push(t.cleanup);
    t.db.close();
    const again = openDatabase(t.file);
    expect(again.migration.applied).toEqual([]);
    expect(again.migration.currentVersion).toBe(1);
    again.db.close();
  });

  it('applies a newly added migration file without touching existing ones', () => {
    const dir = copyOfRealMigrations();
    const db = new DatabaseSync(':memory:');
    expect(migrate(db, loadMigrations(dir)).applied).toEqual([1]);
    writeFileSync(
      path.join(dir, '0002_extra.sql'),
      'CREATE TABLE extra (id TEXT PRIMARY KEY) STRICT;',
    );
    expect(migrate(db, loadMigrations(dir))).toEqual({ applied: [2], currentVersion: 2 });
    expect(tableNames(db)).toContain('extra');
    db.close();
  });

  it('rejects an applied migration whose content changed', () => {
    const dir = copyOfRealMigrations();
    const db = new DatabaseSync(':memory:');
    migrate(db, loadMigrations(dir));
    writeFileSync(path.join(dir, '0001_core.sql'), 'CREATE TABLE x (id TEXT) STRICT;');
    expect(() => migrate(db, loadMigrations(dir))).toThrow(/已套用後被修改/);
    db.close();
  });

  it('rejects a database newer than the code', () => {
    const dir = copyOfRealMigrations();
    const db = new DatabaseSync(':memory:');
    writeFileSync(path.join(dir, '0002_extra.sql'), 'CREATE TABLE extra (id TEXT) STRICT;');
    migrate(db, loadMigrations(dir));
    rmSync(path.join(dir, '0002_extra.sql'));
    expect(() => migrate(db, loadMigrations(dir))).toThrow(StorageError);
    db.close();
  });

  it('rolls back a failing migration entirely', () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, '0001_bad.sql'),
      'CREATE TABLE half (id TEXT) STRICT; CREATE TABLE half (id TEXT) STRICT;',
    );
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, loadMigrations(dir))).toThrow();
    expect(tableNames(db)).toEqual(['schema_migrations']);
    expect(db.prepare('SELECT count(*) AS n FROM schema_migrations').get()).toEqual({ n: 0 });
    db.close();
  });

  it('rejects malformed file names and duplicate versions', () => {
    const bad = tempDir();
    writeFileSync(path.join(bad, '1_core.sql'), '');
    expect(() => loadMigrations(bad)).toThrow(/檔名不合規/);

    const dup = tempDir();
    writeFileSync(path.join(dup, '0001_a.sql'), '');
    writeFileSync(path.join(dup, '0001_b.sql'), '');
    expect(() => loadMigrations(dup)).toThrow(/版本重複/);
  });
});

describe('transaction', () => {
  it('rolls back on error and supports nesting', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (v INTEGER) STRICT');
    transaction(db, () => {
      db.exec('INSERT INTO t VALUES (1)');
      expect(() =>
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (2)');
          throw new Error('boom');
        }),
      ).toThrow('boom');
    });
    expect(db.prepare('SELECT v FROM t').all()).toEqual([{ v: 1 }]);
    db.close();
  });
});
