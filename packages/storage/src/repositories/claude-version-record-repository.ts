import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';

/**
 * Claude CLI 版本驗證紀錄的原始 JSON（P1-T058）。內容格式由 @rolecraft/providers 的版本閘門
 * 解析與驗證（storage 不依賴 providers）；這裡只依新增順序保存，不修改（觸發器擋 UPDATE）。
 */
export interface ClaudeVersionRecordRepository {
  /** 依新增順序的 JSON 字串 */
  list(): string[];
  append(json: string, recordedAt: string): void;
}

export function createClaudeVersionRecordRepository(
  db: DatabaseSync,
): ClaudeVersionRecordRepository {
  return {
    list() {
      return db
        .prepare('SELECT seq, data FROM claude_version_records ORDER BY seq')
        .all()
        .map((row) => {
          const data = row['data'];
          if (typeof data !== 'string') {
            throw new StorageError(
              `claude_version_records[${String(row['seq'])}]：data 欄不是文字`,
            );
          }
          return data;
        });
    },
    append(json, recordedAt) {
      db.prepare('INSERT INTO claude_version_records (recorded_at, data) VALUES (?, ?)').run(
        recordedAt,
        json,
      );
    },
  };
}
