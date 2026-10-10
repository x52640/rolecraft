import type { DatabaseSync } from 'node:sqlite';

import { RunCheckRecord, type Provider } from '@rolecraft/contracts';

import { decode, encode } from './json-table.ts';

/**
 * 每次執行的 R6 確認紀錄：只新增、不修改（資料表另有觸發器擋 UPDATE）。
 * 同一 ID 重複新增會失敗，避免覆寫既有紀錄。
 */
export interface RunCheckRecordRepository {
  append(record: RunCheckRecord): RunCheckRecord;
  get(id: string): RunCheckRecord | null;
  /** 依新增順序 */
  listByProvider(provider: Provider): RunCheckRecord[];
}

export function createRunCheckRecordRepository(db: DatabaseSync): RunCheckRecordRepository {
  const where = (id: unknown) => `run_check_records[${String(id)}]`;
  return {
    append(record) {
      const { value, json } = encode(RunCheckRecord, record);
      db.prepare(
        'INSERT INTO run_check_records (id, provider, checked_at, data) VALUES (?, ?, ?, ?)',
      ).run(value.id, value.provider, value.checkedAt, json);
      return value;
    },
    get(id) {
      const row = db.prepare('SELECT data FROM run_check_records WHERE id = ?').get(id);
      return row ? decode(RunCheckRecord, row.data, where(id)) : null;
    },
    listByProvider(provider) {
      return db
        .prepare('SELECT id, data FROM run_check_records WHERE provider = ? ORDER BY seq')
        .all(provider)
        .map((row) => decode(RunCheckRecord, row.data, where(row.id)));
    },
  };
}
