import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';

/**
 * R4 讀檔紀錄（路徑、時間、雜湊供驗收；P1-T058）：只新增，不提供修改與刪除
 * （資料表另有觸發器擋 UPDATE、DELETE）。
 */
export interface SourceReadLogEntry {
  readonly itemId: string;
  readonly folderId: string;
  readonly relPath: string;
  readonly readAt: string;
  readonly contentHash: string;
}

export interface SourceReadLogRepository {
  append(entry: SourceReadLogEntry): void;
  /** 依新增順序 */
  list(): SourceReadLogEntry[];
}

function column(row: Record<string, unknown>, name: string): string {
  const value = row[name];
  if (typeof value !== 'string') {
    throw new StorageError(`source_read_log[${String(row['seq'])}]：${name} 欄不合法`);
  }
  return value;
}

export function createSourceReadLogRepository(db: DatabaseSync): SourceReadLogRepository {
  return {
    append(entry) {
      db.prepare(
        'INSERT INTO source_read_log (item_id, folder_id, rel_path, read_at, content_hash) VALUES (?, ?, ?, ?, ?)',
      ).run(entry.itemId, entry.folderId, entry.relPath, entry.readAt, entry.contentHash);
    },
    list() {
      return db
        .prepare(
          'SELECT seq, item_id, folder_id, rel_path, read_at, content_hash FROM source_read_log ORDER BY seq',
        )
        .all()
        .map((row) => ({
          itemId: column(row, 'item_id'),
          folderId: column(row, 'folder_id'),
          relPath: column(row, 'rel_path'),
          readAt: column(row, 'read_at'),
          contentHash: column(row, 'content_hash'),
        }));
    },
  };
}
