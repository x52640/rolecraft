import type { DatabaseSync } from 'node:sqlite';

import { WorkJob, WorkUnit } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';
import { transaction } from '../transaction.ts';
import { decode } from './json-table.ts';

/**
 * 工作與工作單元（R9）。工作一列、單元各一列（保留順序），整筆在同一交易內寫入，
 * 不會只寫到一半；讀出時重組成 WorkJob 再用 contracts schema 驗證。
 */
export interface WorkJobRepository {
  save(job: WorkJob): WorkJob;
  get(id: string): WorkJob | null;
  list(): WorkJob[];
  delete(id: string): boolean;
}

export function createWorkJobRepository(db: DatabaseSync): WorkJobRepository {
  function load(id: string, status: unknown, pauseReason: unknown): WorkJob {
    const where = `work_jobs[${id}]`;
    const units = db
      .prepare('SELECT data FROM work_units WHERE job_id = ? ORDER BY position')
      .all(id)
      .map((row) => decode(WorkUnit, row.data, where));
    try {
      return WorkJob.parse({ id, status, units, pauseReason });
    } catch (error) {
      throw new StorageError(`${where}：資料庫內容不符合 contracts schema`, { cause: error });
    }
  }

  return {
    save(job) {
      const parsed = WorkJob.parse(job);
      return transaction(db, () => {
        db.prepare(
          `INSERT INTO work_jobs (id, status, pause_reason) VALUES (?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET status = excluded.status, pause_reason = excluded.pause_reason`,
        ).run(parsed.id, parsed.status, parsed.pauseReason);
        db.prepare('DELETE FROM work_units WHERE job_id = ?').run(parsed.id);
        const insert = db.prepare(
          'INSERT INTO work_units (job_id, position, id, status, data) VALUES (?, ?, ?, ?, ?)',
        );
        parsed.units.forEach((unit, position) => {
          insert.run(parsed.id, position, unit.id, unit.status, JSON.stringify(unit));
        });
        return parsed;
      });
    },
    get(id) {
      const row = db.prepare('SELECT status, pause_reason FROM work_jobs WHERE id = ?').get(id);
      return row ? load(id, row.status, row.pause_reason) : null;
    },
    list() {
      return db
        .prepare('SELECT id, status, pause_reason FROM work_jobs ORDER BY rowid')
        .all()
        .map((row) => load(String(row.id), row.status, row.pause_reason));
    },
    delete(id) {
      return db.prepare('DELETE FROM work_jobs WHERE id = ?').run(id).changes > 0;
    },
  };
}
