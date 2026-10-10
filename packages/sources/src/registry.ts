/**
 * 授權集合與讀檔紀錄（R4）。不直接碰檔案系統：每個資料夾的列舉與讀取
 * 透過注入的 FolderAccess 完成，所以本機 fs 與瀏覽器送資料兩種機制都能用。
 *
 * 讀檔介面只接受項目 ID；只有 authorized 且最近一次列舉仍在的項目會被讀。
 */
import { createHash, randomUUID } from 'node:crypto';

import {
  classifyEntry,
  DEFAULT_MAX_FILE_BYTES,
  looksBinary,
  type FilterOptions,
} from './filter.ts';
import { isUnderDir, splitRelPath } from './path-rules.ts';
import type {
  ExcludedEntry,
  FolderAccess,
  FolderSummary,
  ReadLogEntry,
  ReadRejection,
  ReadRejectionNotice,
  ReadResult,
  SourceItem,
} from './types.ts';

export interface RegistryOptions {
  readonly clock?: () => Date;
  readonly newId?: () => string;
  readonly maxFileBytes?: number;
  readonly customNames?: readonly string[];
  /** 每次成功讀取後呼叫，供持久化讀檔紀錄。 */
  readonly onRead?: (entry: ReadLogEntry) => void;
}

interface FolderState {
  readonly id: string;
  readonly label: string;
  readonly access: FolderAccess;
  excluded: readonly ExcludedEntry[];
  /** relPath（大小寫完全相同）→ 項目 ID */
  readonly byPath: Map<string, string>;
}

type MutableItem = { -readonly [K in keyof SourceItem]: SourceItem[K] };

export class SourceRegistry {
  readonly #folders = new Map<string, FolderState>();
  readonly #items = new Map<string, MutableItem>();
  readonly #readLog: ReadLogEntry[] = [];
  readonly #rejections: ReadRejectionNotice[] = [];
  readonly #clock: () => Date;
  readonly #newId: () => string;
  readonly #filter: FilterOptions;
  readonly #onRead: ((entry: ReadLogEntry) => void) | undefined;

  constructor(options: RegistryOptions = {}) {
    this.#clock = options.clock ?? (() => new Date());
    this.#newId = options.newId ?? randomUUID;
    this.#filter = {
      maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      customNames: options.customNames ?? [],
    };
    this.#onRead = options.onRead;
  }

  /** 新增資料夾並列舉；可以連續新增多個（F03）。新候選一律待確認。 */
  async addFolder(label: string, access: FolderAccess): Promise<FolderSummary> {
    const folder: FolderState = {
      id: this.#newId(),
      label,
      access,
      excluded: [],
      byPath: new Map(),
    };
    this.#folders.set(folder.id, folder);
    return this.refreshFolder(folder.id);
  }

  /** 重新列舉（增量更新）：新出現的候選標待確認；既有項目保留授權狀態。 */
  async refreshFolder(folderId: string): Promise<FolderSummary> {
    const folder = this.#requireFolder(folderId);
    const entries = await folder.access.list();
    if (this.#folders.get(folderId) !== folder) throw new Error('資料夾已移除');
    const seen = new Set<string>();
    const excluded: ExcludedEntry[] = [];
    for (const entry of entries) {
      const verdict = classifyEntry(entry.relPath, entry.kind, entry.size, this.#filter);
      if (!verdict.eligible) {
        excluded.push({ relPath: entry.relPath, reason: verdict.reason });
        continue;
      }
      if (seen.has(entry.relPath)) continue;
      seen.add(entry.relPath);
      const existingId = folder.byPath.get(entry.relPath);
      const existing = existingId === undefined ? undefined : this.#items.get(existingId);
      if (existing) {
        existing.size = entry.size;
        existing.priority = verdict.priority;
        existing.present = true;
        continue;
      }
      const item: MutableItem = {
        id: this.#newId(),
        folderId,
        relPath: entry.relPath,
        size: entry.size,
        priority: verdict.priority,
        status: 'pending',
        present: true,
      };
      this.#items.set(item.id, item);
      folder.byPath.set(item.relPath, item.id);
    }
    for (const id of folder.byPath.values()) {
      const item = this.#items.get(id);
      if (item && !seen.has(item.relPath)) item.present = false;
    }
    folder.excluded = excluded;
    return this.#summary(folder);
  }

  /** 移除資料夾：其下所有項目立即從授權集合消失，之後的讀取一律拒絕。 */
  removeFolder(folderId: string): void {
    const folder = this.#requireFolder(folderId);
    for (const id of folder.byPath.values()) this.#items.delete(id);
    this.#folders.delete(folderId);
  }

  folders(): FolderSummary[] {
    return [...this.#folders.values()].map((f) => this.#summary(f));
  }

  /** 預覽清單，依優先序、路徑排序。 */
  items(folderId?: string): SourceItem[] {
    return [...this.#items.values()]
      .filter((i) => folderId === undefined || i.folderId === folderId)
      .sort((a, b) => a.priority - b.priority || a.relPath.localeCompare(b.relPath))
      .map((i) => ({ ...i }));
  }

  /** 使用者在預覽中確認：加入授權集合。只能確認最近一次列舉仍在的候選。 */
  authorize(itemId: string): void {
    const item = this.#requireItem(itemId);
    if (!item.present) throw new Error('檔案已不在資料夾內，請重新列舉');
    item.status = 'authorized';
  }

  /** 取消勾選：立即停止讀取。 */
  revoke(itemId: string): void {
    this.#requireItem(itemId).status = 'revoked';
  }

  /**
   * 移除預覽中的整個子資料夾。dirRelPath 必須是乾淨的相對路徑（可帶一個結尾 `/`），
   * 且是最近列舉中某個候選檔所在的資料夾（大小寫需完全相同）；否則丟錯，不會默默撤銷 0 筆。
   * 空字串（整個資料夾）一律拒絕：要停止讀整個資料夾請用 removeFolder。
   */
  revokeUnder(folderId: string, dirRelPath: string): number {
    const folder = this.#requireFolder(folderId);
    const normalized = dirRelPath.endsWith('/') ? dirRelPath.slice(0, -1) : dirRelPath;
    const segments = splitRelPath(normalized);
    if (!segments) throw new Error(`不合法的資料夾路徑：${JSON.stringify(dirRelPath)}`);
    const dir = segments.join('/');
    const known = [...folder.byPath.keys()].some((rel) => rel.startsWith(`${dir}/`));
    if (!known) throw new Error(`列舉結果中沒有這個資料夾：${dir}`);
    let count = 0;
    for (const id of folder.byPath.values()) {
      const item = this.#items.get(id);
      if (item && isUnderDir(item.relPath, dir)) {
        item.status = 'revoked';
        count += 1;
      }
    }
    return count;
  }

  /** 安全讀檔：只接受項目 ID。 */
  async read(itemId: string): Promise<ReadResult> {
    const item = this.#items.get(itemId);
    if (!item) return this.#reject(itemId, null, 'unknown_item');
    const precheck = this.#readable(item);
    if (precheck) return this.#reject(itemId, item.relPath, precheck);
    const folder = this.#folders.get(item.folderId);
    if (!folder) return this.#reject(itemId, item.relPath, 'folder_removed');

    let result;
    try {
      result = await folder.access.read(item.relPath, this.#filter.maxFileBytes);
    } catch {
      return this.#reject(itemId, item.relPath, 'io_error');
    }
    // 讀取期間可能被取消勾選或移除資料夾：再檢查一次，不交出內容。
    const current = this.#items.get(itemId);
    const recheck = current ? this.#readable(current) : 'unknown_item';
    if (recheck) return this.#reject(itemId, item.relPath, recheck);
    if (!this.#folders.has(item.folderId)) {
      return this.#reject(itemId, item.relPath, 'folder_removed');
    }
    if (!result.ok) return this.#reject(itemId, item.relPath, result.reason);
    if (result.bytes.byteLength > this.#filter.maxFileBytes) {
      return this.#reject(itemId, item.relPath, 'too_large');
    }
    if (looksBinary(result.bytes)) return this.#reject(itemId, item.relPath, 'binary_content');

    const contentHash = createHash('sha256').update(result.bytes).digest('hex');
    const entry: ReadLogEntry = {
      itemId,
      folderId: item.folderId,
      relPath: item.relPath,
      readAt: this.#clock().toISOString(),
      contentHash,
    };
    this.#readLog.push(entry);
    this.#onRead?.(entry);
    return { ok: true, text: new TextDecoder('utf-8').decode(result.bytes), contentHash };
  }

  readLog(): ReadLogEntry[] {
    return [...this.#readLog];
  }

  rejections(): ReadRejectionNotice[] {
    return [...this.#rejections];
  }

  /** 讀之前的狀態檢查；回傳 null 代表可以讀。 */
  #readable(item: MutableItem): ReadRejection | null {
    if (item.status !== 'authorized') return 'not_authorized';
    if (!item.present) return 'not_found';
    // 縱深防禦：即使列舉來源有誤，也再用同一套篩選複查類型。
    const verdict = classifyEntry(item.relPath, 'file', 0, this.#filter);
    return verdict.eligible ? null : 'type_mismatch';
  }

  #reject(itemId: string, relPath: string | null, reason: ReadRejection): ReadResult {
    this.#rejections.push({ itemId, relPath, at: this.#clock().toISOString(), reason });
    return { ok: false, reason };
  }

  #summary(folder: FolderState): FolderSummary {
    return { id: folder.id, label: folder.label, excluded: [...folder.excluded] };
  }

  #requireFolder(folderId: string): FolderState {
    const folder = this.#folders.get(folderId);
    if (!folder) throw new Error(`未知資料夾：${folderId}`);
    return folder;
  }

  #requireItem(itemId: string): MutableItem {
    const item = this.#items.get(itemId);
    if (!item) throw new Error(`未知項目：${itemId}`);
    return item;
  }
}
