// sources 服務的資料區保存（P1-T058，R4）：授權資料夾（不透明 ID 跨重啟不變、記下資料夾身分）、
// 使用者確認／撤銷過的文件、讀檔紀錄（只增不刪）。沒有資料區時不接這裡，全在記憶體。
import type { DatabaseSync } from 'node:sqlite';

import {
  sameFolderIdentity,
  type FolderAccess,
  type FolderIdentity,
  type ReadLogEntry,
  type SourceItem,
} from '@rolecraft/sources';
import {
  createRepositories,
  transaction,
  type StoredFolder,
  type StoredFolderItem,
} from '@rolecraft/storage';

export interface SourcesStore {
  load(): readonly StoredFolder[];
  addFolder(folder: Omit<StoredFolder, 'items'>): void;
  removeFolder(id: string): void;
  saveItems(folderId: string, items: readonly StoredFolderItem[]): void;
  clearItems(folderId: string): void;
  appendRead(entry: ReadLogEntry): void;
  /** fn 內的寫入全部成功才生效 */
  transaction<T>(fn: () => T): T;
}

export function createSourcesStore(db: DatabaseSync): SourcesStore {
  const { authorizedFolders: folders, sourceReadLog: reads } = createRepositories(db);
  return {
    load: () => folders.list(),
    addFolder: (folder) => folders.add(folder),
    removeFolder: (id) => void folders.remove(id),
    saveItems: (folderId, items) => folders.saveItems(folderId, items),
    clearItems: (folderId) => folders.clearItems(folderId),
    appendRead: (entry) => reads.append(entry),
    transaction: (fn) => transaction(db, fn),
  };
}

/** 要寫進資料區的文件狀態：待確認的不存。 */
export function storedItems(items: readonly SourceItem[]): StoredFolderItem[] {
  return items.flatMap((item) =>
    item.status === 'pending'
      ? []
      : [{ id: item.id, relPath: item.relPath, sizeBytes: item.size, status: item.status }],
  );
}

/** 資料夾身分與加入時（或開啟前後）不一致。 */
export class FolderIdentityChanged extends Error {
  constructor() {
    super('資料夾已被換掉（符號連結或另一個資料夾），請移除後重新選取');
  }
}

/**
 * 開啟資料夾並確認身分：開啟前後各讀一次身分必須相同；給了 expected（還原時）也必須相同。
 * 不一致丟 FolderIdentityChanged；路徑不存在或不是資料夾照原錯誤丟出。
 */
export async function openVerifiedFolder(
  absolutePath: string,
  identify: (absolutePath: string) => Promise<FolderIdentity>,
  open: (absolutePath: string) => Promise<FolderAccess>,
  expected?: FolderIdentity,
): Promise<{ access: FolderAccess; identity: FolderIdentity }> {
  const before = await identify(absolutePath);
  if (expected && !sameFolderIdentity(expected, before)) throw new FolderIdentityChanged();
  const access = await open(absolutePath);
  const after = await identify(absolutePath);
  if (!sameFolderIdentity(before, after)) throw new FolderIdentityChanged();
  return { access, identity: before };
}

/** 身分不符後換上的存取物件：列舉與讀取一律失敗。 */
export function blockedFolderAccess(): FolderAccess {
  const fail = () => Promise.reject(new FolderIdentityChanged());
  return { list: fail, read: fail };
}

/**
 * 還原時不立刻開資料夾：第一次列舉或讀取才開；開不了（路徑已不存在、已不是資料夾）就讓該次
 * 列舉丟錯（預覽回「無法讀取」）、讀取回 io_error，資料夾照常列出、不自動刪，下次再試。
 * 身分不符時呼叫 onIdentityChanged（由呼叫端鎖住整個資料夾）。
 */
export function lazyFolderAccess(
  open: () => Promise<FolderAccess>,
  onIdentityChanged: () => void,
): FolderAccess {
  let opened: Promise<FolderAccess> | null = null;
  const get = (): Promise<FolderAccess> => {
    opened ??= open().catch((error: unknown) => {
      opened = null;
      if (error instanceof FolderIdentityChanged) onIdentityChanged();
      throw error;
    });
    return opened;
  };
  return {
    list: async () => (await get()).list(),
    read: async (relPath, maxBytes) => (await get()).read(relPath, maxBytes),
  };
}
