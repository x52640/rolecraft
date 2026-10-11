// sources 服務的資料區保存（P1-T058，R4）：授權資料夾（不透明 ID 跨重啟不變）、
// 使用者確認／撤銷過的文件、讀檔紀錄（只增不刪）。沒有資料區時不接這裡，全在記憶體。
import type { DatabaseSync } from 'node:sqlite';

import type { FolderAccess, ReadLogEntry } from '@rolecraft/sources';
import { createRepositories, type StoredFolder, type StoredFolderItem } from '@rolecraft/storage';

export interface SourcesStore {
  load(): readonly StoredFolder[];
  addFolder(folder: Omit<StoredFolder, 'items'>): void;
  removeFolder(id: string): void;
  saveItems(folderId: string, items: readonly StoredFolderItem[]): void;
  appendRead(entry: ReadLogEntry): void;
}

export function createSourcesStore(db: DatabaseSync): SourcesStore {
  const { authorizedFolders: folders, sourceReadLog: reads } = createRepositories(db);
  return {
    load: () => folders.list(),
    addFolder: (folder) => folders.add(folder),
    removeFolder: (id) => void folders.remove(id),
    saveItems: (folderId, items) => folders.saveItems(folderId, items),
    appendRead: (entry) => reads.append(entry),
  };
}

/**
 * 還原時不立刻開資料夾：第一次列舉或讀取才開；開不了（路徑已不存在、已不是資料夾）就讓該次
 * 列舉丟錯（預覽回「無法讀取」）、讀取回 io_error，資料夾照常列出、不自動刪。下次再試。
 */
export function lazyFolderAccess(
  absolutePath: string,
  open: (absolutePath: string) => Promise<FolderAccess>,
): FolderAccess {
  let opened: Promise<FolderAccess> | null = null;
  const get = (): Promise<FolderAccess> => {
    opened ??= open(absolutePath).catch((error: unknown) => {
      opened = null;
      throw error;
    });
    return opened;
  };
  return {
    list: async () => (await get()).list(),
    read: async (relPath, maxBytes) => (await get()).read(relPath, maxBytes),
  };
}
