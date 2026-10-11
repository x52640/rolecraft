// sources.* 服務的本機實作（P1-T021，F03、R4）：helper 持有資料夾路徑與授權集合，
// 瀏覽器端只拿到不透明 ID 與名稱。列舉、篩選、安全讀檔由 @rolecraft/sources 負責。
//
// 授權流程：選取資料夾 → 預覽（只列不讀）→ 使用者勾選後 update_authorization 才進授權集合。
// 新出現的候選一律待確認，不自動授權；只接受最近一次預覽回過的文件 ID。
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { SourceEntry, type SourceRoot, type SourceRootView } from '@rolecraft/contracts';
import {
  createNodeFolderAccess,
  readFolderIdentity,
  SourceRegistry,
  type FolderAccess,
  type FolderIdentity,
} from '@rolecraft/sources';

import { MAX_OUTGOING_BYTES } from '../../bridge/framing.ts';
import { openVerifiedFolder, storedItems, type SourcesStore } from './persistence.ts';
import { buildPreviewEntries } from './preview-tree.ts';
import { restoreRoot, type RootState, type RootsContext, writeMemoryToStore } from './restore.ts';
import type {
  PickFoldersResult,
  PreviewResult,
  SourcesService,
  UpdateAuthorizationResult,
} from './service.ts';

/**
 * 系統資料夾選取器：回傳使用者選的絕對路徑，取消回空陣列。
 * 不接受任何來自請求的參數（ADR-0003）；測試注入假的，不開真的對話框。
 */
export type FolderPicker = () => Promise<readonly string[]>;

export interface LocalSourcesOptions {
  /** 省略時不提供 pickFolders（該操作回 not_implemented）。 */
  readonly picker?: FolderPicker;
  readonly registry?: SourceRegistry;
  /** 建立資料夾存取物件；預設為本機 fs 版。 */
  readonly openFolder?: (absolutePath: string) => Promise<FolderAccess>;
  readonly newId?: () => string;
  /** 只供測試調小。 */
  readonly maxPreviewBytes?: number;
  /** 資料區保存（P1-T058）；省略時全在記憶體（未設資料區），之後可 attachStore 接上。 */
  readonly store?: SourcesStore;
  readonly clock?: () => Date;
  /** 讀資料夾身分（實際路徑＋dev/ino）；預設本機 fs 版。 */
  readonly identify?: (absolutePath: string) => Promise<FolderIdentity>;
}

const UNNAMED = '（未命名資料夾）';

/** 預覽回應的位元組上限：host 單則上限扣掉信封與餘裕。 */
export const MAX_PREVIEW_BYTES = MAX_OUTGOING_BYTES - 64 * 1024;

function displayName(absolutePath: string): string {
  const base = path.basename(absolutePath);
  if (/\S/u.test(base)) return base;
  return absolutePath === path.sep ? path.sep : UNNAMED;
}

/** createSourcesService 的回傳：handler 用的服務，加上授權集合本身。 */
export type LocalSources = SourcesService & {
  /** 授權集合與讀檔紀錄；後續分析（讀檔）只能經由它、只用文件 ID。 */
  readonly registry: SourceRegistry;
  /**
   * 資料區被占用期間建立、接手後才接上資料區（P1-T058）：記憶體中的資料夾、授權與讀檔紀錄寫進資料區
   * （同一路徑以記憶體為準），資料區已有的其他資料夾一併還原；之後的變更與讀檔都寫資料區。
   */
  attachStore(store: SourcesStore): void;
};

/** 組裝 sources 服務；沒給 picker 時不提供 pickFolders（回 not_implemented）。 */
export function createSourcesService(options: LocalSourcesOptions = {}): LocalSources {
  const core = new LocalSourcesCore(options);
  const { picker } = options;
  return {
    registry: core.registry,
    attachStore: (store) => core.attachStore(store),
    listFolders: () => core.listFolders(),
    preview: (rootId) => core.preview(rootId),
    updateAuthorization: (rootId, authorize, revoke) =>
      core.updateAuthorization(rootId, authorize, revoke),
    removeFolder: (rootId) => core.removeFolder(rootId),
    ...(picker ? { pickFolders: () => core.pickFolders(picker) } : {}),
  };
}

class LocalSourcesCore {
  readonly registry: SourceRegistry;
  readonly #roots = new Map<string, RootState>();
  readonly #openFolder: (absolutePath: string) => Promise<FolderAccess>;
  readonly #identify: (absolutePath: string) => Promise<FolderIdentity>;
  readonly #newId: () => string;
  readonly #maxPreviewBytes: number;
  readonly #clock: () => Date;
  #store: SourcesStore | null = null;
  #picking = false;
  readonly #ctx: RootsContext;

  constructor(options: LocalSourcesOptions = {}) {
    this.#clock = options.clock ?? (() => new Date());
    // 讀檔紀錄寫不進資料區 → 該次讀取丟錯、不交出內容（R4：每次讀取都要有紀錄）。
    this.registry =
      options.registry ?? new SourceRegistry({ onRead: (entry) => this.#store?.appendRead(entry) });
    this.#openFolder = options.openFolder ?? ((p) => createNodeFolderAccess(p));
    this.#identify = options.identify ?? readFolderIdentity;
    this.#newId = options.newId ?? randomUUID;
    this.#maxPreviewBytes = options.maxPreviewBytes ?? MAX_PREVIEW_BYTES;
    this.#ctx = {
      registry: this.registry,
      roots: this.#roots,
      identify: this.#identify,
      openFolder: this.#openFolder,
      store: () => this.#store,
    };
    if (options.store) {
      for (const saved of options.store.load()) restoreRoot(this.#ctx, saved);
      this.#store = options.store;
    }
  }

  attachStore(store: SourcesStore): void {
    if (this.#store) return;
    const rest = writeMemoryToStore(this.#ctx, store);
    this.#store = store;
    for (const row of rest) restoreRoot(this.#ctx, row);
  }

  async pickFolders(picker: FolderPicker): Promise<PickFoldersResult> {
    if (this.#picking) return { status: 'busy' };
    this.#picking = true;
    try {
      const chosen = await picker();
      if (chosen.length === 0) return { status: 'cancelled' };
      const roots: SourceRoot[] = [];
      let failures = 0;
      for (const picked of chosen) {
        const root = await this.#addRoot(picked);
        if (root) roots.push(root);
        else failures += 1;
      }
      if (roots.length === 0 && failures > 0) throw new Error('無法開啟選取的資料夾');
      return roots.length === 0 ? { status: 'cancelled' } : { status: 'selected', roots };
    } finally {
      this.#picking = false;
    }
  }

  /** 加入一個選取的資料夾；同一路徑已加入就沿用。失敗回 null（不留下半套狀態）。 */
  async #addRoot(picked: string): Promise<SourceRoot | null> {
    if (!path.isAbsolute(picked)) return null;
    const absolutePath = path.resolve(picked);
    for (const [rootId, state] of this.#roots) {
      if (state.absolutePath === absolutePath) return { rootId, name: displayName(absolutePath) };
    }
    // 資料區已有同一路徑（例如另一個 helper 加的）：沿用它，開啟時一樣比對身分。
    const saved = this.#store?.load().find((f) => f.absolutePath === absolutePath);
    if (saved) {
      restoreRoot(this.#ctx, saved);
      return { rootId: saved.id, name: saved.displayName };
    }
    const before = new Set(this.registry.folders().map((f) => f.id));
    try {
      const { access, identity } = await openVerifiedFolder(
        absolutePath,
        this.#identify,
        this.#openFolder,
      );
      const summary = await this.registry.addFolder(displayName(absolutePath), access);
      const addedAt = this.#clock().toISOString();
      // 先寫進資料區才算加入；寫不進去就照失敗處理（下方清掉 registry 裡的半套狀態）。
      this.#store?.addFolder({
        id: summary.id,
        absolutePath,
        displayName: summary.label,
        authorizedAt: addedAt,
        identity,
      });
      this.#roots.set(summary.id, {
        absolutePath,
        identity,
        addedAt,
        containerIds: new Map(),
        previewed: new Set(),
      });
      return { rootId: summary.id, name: summary.label };
    } catch {
      for (const folder of this.registry.folders()) {
        if (!before.has(folder.id) && !this.#roots.has(folder.id)) {
          this.registry.removeFolder(folder.id);
        }
      }
      return null;
    }
  }

  listFolders(): SourceRootView[] {
    return this.registry
      .folders()
      .filter((folder) => this.#roots.has(folder.id))
      .map((folder) => {
        const items = this.registry.items(folder.id).filter((item) => item.present);
        return {
          rootId: folder.id,
          name: folder.label,
          pendingCount: items.filter((item) => item.status === 'pending').length,
          authorizedCount: items.filter((item) => item.status === 'authorized').length,
        };
      });
  }

  async preview(rootId: string): Promise<PreviewResult> {
    const state = this.#roots.get(rootId);
    if (!state) return { status: 'unknown_root' };
    try {
      await this.registry.refreshFolder(rootId);
    } catch {
      return this.#roots.has(rootId) ? { status: 'unreadable' } : { status: 'unknown_root' };
    }
    if (this.#roots.get(rootId) !== state) return { status: 'unknown_root' };
    const items = this.registry.items(rootId).filter((item) => item.present);
    const entries = buildPreviewEntries(items, state.containerIds, this.#newId);
    // 先確認回應合法且送得出去，才替換「最近一次預覽」；否則保留上一次的。
    if (!entries.every((entry) => SourceEntry.safeParse(entry).success)) {
      return { status: 'unreadable' };
    }
    const bytes = Buffer.byteLength(JSON.stringify({ ok: true, entries }), 'utf8');
    if (bytes > this.#maxPreviewBytes) return { status: 'too_large' };
    state.previewed = new Set(items.map((item) => item.id));
    return { status: 'ok', entries };
  }

  updateAuthorization(
    rootId: string,
    authorize: readonly string[],
    revoke: readonly string[],
  ): UpdateAuthorizationResult {
    const state = this.#roots.get(rootId);
    if (!state) return 'unknown_root';
    const current = new Map(this.registry.items(rootId).map((item) => [item.id, item]));
    // 先全部檢查再套用：任一項不合法就整筆不動。
    const ok =
      authorize.every((id) => state.previewed.has(id) && current.get(id)?.present === true) &&
      revoke.every((id) => state.previewed.has(id) && current.has(id));
    if (!ok) return 'invalid_entry';
    // 先寫進資料區才生效（撤銷也是）：寫不進去就丟錯、記憶體不變，不會重啟後又變回已授權。
    const pick = (ids: readonly string[], status: 'authorized' | 'revoked') =>
      ids.flatMap((id) => {
        const item = current.get(id);
        return item ? [{ ...item, status }] : [];
      });
    this.#store?.saveItems(
      rootId,
      storedItems([...pick(revoke, 'revoked'), ...pick(authorize, 'authorized')]),
    );
    for (const id of revoke) this.registry.revoke(id);
    for (const id of authorize) this.registry.authorize(id);
    return 'ok';
  }

  removeFolder(rootId: string): boolean {
    if (!this.#roots.has(rootId)) return false;
    // 先從資料區移除才生效：寫不進去就丟錯、記憶體不變。
    this.#store?.removeFolder(rootId);
    this.#roots.delete(rootId);
    this.registry.removeFolder(rootId);
    return true;
  }
}
