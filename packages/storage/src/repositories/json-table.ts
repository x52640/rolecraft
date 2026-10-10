import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { StorageError } from '../errors.ts';

/**
 * repository 共用的「資料表＝索引欄位＋data JSON」讀寫。
 * 寫入前、讀出後都用 contracts schema 驗證：寫入不合規就拋 schema 錯誤（呼叫端的錯）；
 * 讀出不合規代表資料庫被破壞或 migration 漏了，拋 StorageError。
 * 表名與欄名只來自各 repository 的常數，不接受外部輸入。
 */

/** contracts 的 zod schema 只需要 parse；storage 不直接依賴 zod（lint 規則）。 */
export interface Schema<T> {
  parse(input: unknown): T;
}

/** 驗證並序列化。回傳驗證後的值與 JSON。 */
export function encode<T>(schema: Schema<T>, value: T): { value: T; json: string } {
  const parsed = schema.parse(value);
  return { value: parsed, json: JSON.stringify(parsed) };
}

/** 反序列化並驗證。 */
export function decode<T>(schema: Schema<T>, json: unknown, where: string): T {
  if (typeof json !== 'string') throw new StorageError(`${where}：data 欄不是文字`);
  try {
    return schema.parse(JSON.parse(json));
  } catch (error) {
    throw new StorageError(`${where}：資料庫內容不符合 contracts schema`, { cause: error });
  }
}

export interface JsonTable<T> {
  get(key: string): T | null;
  /** 依插入順序列出；可加 WHERE（欄名為常數）與參數 */
  list(where?: string, ...params: SQLInputValue[]): T[];
  /** 新增或整筆取代（data 與索引欄一起更新） */
  upsert(columns: Record<string, SQLInputValue>, value: T): T;
  delete(key: string): boolean;
}

export function jsonTable<T>(
  db: DatabaseSync,
  table: string,
  keyColumn: string,
  schema: Schema<T>,
): JsonTable<T> {
  const where = (key: string) => `${table}[${key}]`;
  return {
    get(key) {
      const row = db.prepare(`SELECT data FROM ${table} WHERE ${keyColumn} = ?`).get(key);
      return row ? decode(schema, row.data, where(key)) : null;
    },
    list(condition, ...params) {
      const sql = `SELECT ${keyColumn} AS k, data FROM ${table}${condition ? ` WHERE ${condition}` : ''} ORDER BY rowid`;
      return db
        .prepare(sql)
        .all(...params)
        .map((row) => decode(schema, row.data, where(String(row.k))));
    },
    upsert(columns, value) {
      const { value: parsed, json } = encode(schema, value);
      const names = [...Object.keys(columns), 'data'];
      const updates = names.filter((n) => n !== keyColumn).map((n) => `${n} = excluded.${n}`);
      db.prepare(
        `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})
         ON CONFLICT (${keyColumn}) DO UPDATE SET ${updates.join(', ')}`,
      ).run(...Object.values(columns), json);
      return parsed;
    },
    delete(key) {
      return db.prepare(`DELETE FROM ${table} WHERE ${keyColumn} = ?`).run(key).changes > 0;
    },
  };
}
