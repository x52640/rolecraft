import type { DatabaseSync } from 'node:sqlite';

import { StorageError } from '../errors.ts';
import { transaction } from '../transaction.ts';

/**
 * 授權資料夾與使用者確認／撤銷過的文件（R4，P1-T058）。資料夾 ID 由 helper 配發，跨重啟不變；
 * 絕對路徑只給 helper 用（R7）。待確認的候選不存；移除資料夾連同其文件一起刪（讀檔紀錄另存、不刪）。
 */
export type StoredItemStatus = 'authorized' | 'revoked';

export interface StoredFolderItem {
  readonly id: string;
  readonly relPath: string;
  readonly sizeBytes: number;
  readonly status: StoredItemStatus;
}

export interface StoredFolder {
  readonly id: string;
  readonly absolutePath: string;
  readonly displayName: string;
  readonly authorizedAt: string;
  readonly items: readonly StoredFolderItem[];
}

export interface AuthorizedFolderRepository {
  /** 依加入順序 */
  list(): StoredFolder[];
  add(folder: Omit<StoredFolder, 'items'>): void;
  /** 不存在回 false */
  remove(id: string): boolean;
  /** 新增或更新文件狀態（同一交易）；資料夾不存在或 ID 對不上就整筆失敗 */
  saveItems(folderId: string, items: readonly StoredFolderItem[]): void;
}

const where = (id: unknown) => `authorized_folders[${String(id)}]`;

function text(value: unknown, field: string, id: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new StorageError(`${where(id)}：${field} 欄不合法`);
  }
  return value;
}

function toItem(row: Record<string, unknown>, folderId: unknown): StoredFolderItem {
  const size = row['size_bytes'];
  const status = row['status'];
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
    throw new StorageError(`${where(folderId)}：size_bytes 欄不合法`);
  }
  if (status !== 'authorized' && status !== 'revoked') {
    throw new StorageError(`${where(folderId)}：status 欄不合法`);
  }
  return {
    id: text(row['id'], 'id', folderId),
    relPath: text(row['rel_path'], 'rel_path', folderId),
    sizeBytes: size,
    status,
  };
}

export function createAuthorizedFolderRepository(db: DatabaseSync): AuthorizedFolderRepository {
  return {
    list() {
      const items = db.prepare(
        'SELECT id, rel_path, size_bytes, status FROM authorized_folder_items WHERE folder_id = ? ORDER BY rowid',
      );
      return db
        .prepare(
          'SELECT id, absolute_path, display_name, authorized_at FROM authorized_folders ORDER BY rowid',
        )
        .all()
        .map((row) => {
          const id = text(row['id'], 'id', row['id']);
          return {
            id,
            absolutePath: text(row['absolute_path'], 'absolute_path', id),
            displayName: text(row['display_name'], 'display_name', id),
            authorizedAt: text(row['authorized_at'], 'authorized_at', id),
            items: items.all(id).map((r) => toItem(r, id)),
          };
        });
    },
    add(folder) {
      db.prepare(
        'INSERT INTO authorized_folders (id, absolute_path, display_name, authorized_at) VALUES (?, ?, ?, ?)',
      ).run(folder.id, folder.absolutePath, folder.displayName, folder.authorizedAt);
    },
    remove(id) {
      return transaction(db, () => {
        db.prepare('DELETE FROM authorized_folder_items WHERE folder_id = ?').run(id);
        return db.prepare('DELETE FROM authorized_folders WHERE id = ?').run(id).changes > 0;
      });
    },
    saveItems(folderId, list) {
      transaction(db, () => {
        const exists = db.prepare('SELECT 1 FROM authorized_folders WHERE id = ?').get(folderId);
        if (!exists) throw new StorageError(`${where(folderId)}：資料夾不存在`);
        // 同一 ID 只能更新同一資料夾、同一路徑的那筆；對不上（changes 為 0）整筆回滾。
        const upsert = db.prepare(
          `INSERT INTO authorized_folder_items (id, folder_id, rel_path, size_bytes, status)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET size_bytes = excluded.size_bytes, status = excluded.status
           WHERE folder_id = excluded.folder_id AND rel_path = excluded.rel_path`,
        );
        for (const entry of list) {
          const result = upsert.run(
            entry.id,
            folderId,
            entry.relPath,
            entry.sizeBytes,
            entry.status,
          );
          if (result.changes === 0) throw new StorageError(`${where(folderId)}：文件 ID 不一致`);
        }
      });
    },
  };
}
