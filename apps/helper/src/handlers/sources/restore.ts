// sources 服務的重啟還原與接手接上資料區（P1-T058）。
import type { FolderAccess, FolderIdentity, SourceRegistry } from '@rolecraft/sources';
import type { StoredFolder } from '@rolecraft/storage';

import {
  blockedFolderAccess,
  lazyFolderAccess,
  openVerifiedFolder,
  storedItems,
  type SourcesStore,
} from './persistence.ts';

export interface RootState {
  readonly absolutePath: string;
  /** 加入時的資料夾身分；寫進資料區，重啟後開啟時比對。 */
  readonly identity: FolderIdentity;
  readonly addedAt: string;
  /** 子資料夾相對路徑 → 預覽 ID（跨次預覽沿用）。 */
  readonly containerIds: Map<string, string>;
  /** 最近一次預覽回過的文件 ID；update_authorization 只接受這些。 */
  previewed: ReadonlySet<string>;
}

/** sources 服務內部狀態（由 LocalSourcesCore 提供）。 */
export interface RootsContext {
  readonly registry: SourceRegistry;
  readonly roots: Map<string, RootState>;
  readonly identify: (absolutePath: string) => Promise<FolderIdentity>;
  readonly openFolder: (absolutePath: string) => Promise<FolderAccess>;
  readonly store: () => SourcesStore | null;
}

/**
 * 還原保存的資料夾：ID、授權狀態沿用。第一次開啟才比對身分：路徑失效的照常列出、預覽回無法讀取
 * （不自動刪）；身分不符（換成符號連結或別的資料夾）就整個資料夾不可讀、文件降為待確認。
 */
export function restoreRoot(ctx: RootsContext, saved: StoredFolder): void {
  const { id, absolutePath, identity } = saved;
  const open = async () =>
    (await openVerifiedFolder(absolutePath, ctx.identify, ctx.openFolder, identity)).access;
  ctx.registry.restoreFolder({
    id,
    label: saved.displayName,
    access: lazyFolderAccess(open, () => lockRoot(ctx, id)),
    items: saved.items.map((item) => ({ ...item, size: item.sizeBytes })),
  });
  ctx.roots.set(id, {
    absolutePath,
    identity,
    addedAt: saved.authorizedAt,
    containerIds: new Map(),
    previewed: new Set(),
  });
}

/** 身分不符：清掉這個資料夾的所有授權（記憶體與資料區），之後的列舉與讀取一律失敗。 */
function lockRoot(ctx: RootsContext, rootId: string): void {
  const state = ctx.roots.get(rootId);
  const label = ctx.registry.folders().find((f) => f.id === rootId)?.label;
  if (!state || label === undefined) return;
  ctx.registry.removeFolder(rootId);
  ctx.registry.restoreFolder({ id: rootId, label, access: blockedFolderAccess(), items: [] });
  state.previewed = new Set();
  try {
    ctx.store()?.clearItems(rootId);
  } catch {
    // 寫不進去也無妨：資料區仍存著原本的身分，下次啟動同樣比對不符、同樣鎖住。
  }
}

/**
 * 接手時把記憶體中的資料夾、授權與讀檔紀錄寫進資料區（同一交易；同一路徑以記憶體為準）。
 * 回傳資料區中記憶體沒有的資料夾，由呼叫端還原。寫入失敗整筆不動並丟錯（下次接手再試）。
 */
export function writeMemoryToStore(ctx: RootsContext, store: SourcesStore): StoredFolder[] {
  const saved = store.load();
  const memoryPaths = new Set([...ctx.roots.values()].map((s) => s.absolutePath));
  store.transaction(() => {
    for (const row of saved) if (memoryPaths.has(row.absolutePath)) store.removeFolder(row.id);
    for (const folder of ctx.registry.folders()) {
      const state = ctx.roots.get(folder.id);
      if (!state) continue;
      const { absolutePath, identity, addedAt } = state;
      const row = { id: folder.id, absolutePath, displayName: folder.label, identity };
      store.addFolder({ ...row, authorizedAt: addedAt });
      store.saveItems(folder.id, storedItems(ctx.registry.items(folder.id)));
    }
    for (const entry of ctx.registry.readLog()) store.appendRead(entry);
  });
  return saved.filter((row) => !memoryPaths.has(row.absolutePath));
}
