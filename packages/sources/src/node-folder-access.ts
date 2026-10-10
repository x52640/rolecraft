/**
 * FolderAccess 的本機檔案系統實作（helper 直接讀資料夾的機制）。
 *
 * - 列舉：不跟隨符號連結（symlink 只回報、不進入），所以資料夾內的 symlink 迴圈不會無限走。
 *   每層 readdir 前後都逐段 lstat 確認根到這一層都不是 symlink、(dev, ino) 與發現時相同
 *   （根比對建立時記下的值）；不一致就不採用該層結果：子資料夾回報為 symlink／other，
 *   根資料夾被換掉則丟錯，請使用者重新選取。
 * - 讀取：checkFileAt（逐段 lstat 三明治＋realpath 完全等於預期路徑）→ O_NOFOLLOW 開檔
 *   → fstat 必須是一般檔且與檢查時同一個 inode → （Linux）fd 路徑必須等於預期路徑
 *   → 讀至上限＋1 位元組 → 再跑一次 checkFileAt，檔案仍須是 fd 那個 inode。
 *   路徑檢查不是原子的，殘餘風險見 fs-identity.ts 與 P1-T008 Task。
 * - 硬連結（hardlink）視為資料夾內的檔案：它就是資料夾內的一個目錄項目，無從區分。
 */
import { constants, lstatSync } from 'node:fs';
import { open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import { shouldDescend } from './filter.ts';
import {
  checkFileAt,
  identityOf,
  lstatDirChain,
  pathOfFd,
  sameIdentity,
  type Identity,
} from './fs-identity.ts';
import { splitRelPath } from './path-rules.ts';
import type { AccessReadResult, FolderAccess, RawEntry, ReadRejection } from './types.ts';

/** 讀檔流程中可插入測試動作的時間點（只供測試模擬競態）。 */
export type ReadStage = 'checked' | 'opened' | 'read';

export interface NodeFolderAccessTestHooks {
  readonly onReadStage?: (stage: ReadStage, relPath: string) => void | Promise<void>;
  /** 子資料夾已被發現、尚未 readdir 時呼叫。 */
  readonly beforeReaddir?: (relDir: string) => void | Promise<void>;
}

export interface NodeFolderAccessOptions {
  /** 最多回報幾筆項目，避免巨大資料夾拖垮預覽。 */
  readonly maxEntries?: number;
  readonly maxDepth?: number;
  /** 只供測試。 */
  readonly testHooks?: NodeFolderAccessTestHooks;
}

const DEFAULT_MAX_ENTRIES = 20_000;
const DEFAULT_MAX_DEPTH = 24;
const OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

function rejectFor(error: unknown): ReadRejection {
  switch (errorCode(error)) {
    case 'ENOENT':
    case 'ENOTDIR':
      return 'not_found';
    case 'ELOOP':
    case 'EMLINK': // 某些平台 O_NOFOLLOW 遇到 symlink 回 EMLINK
      return 'symlink';
    case 'EISDIR':
      return 'not_regular_file';
    default:
      return 'io_error';
  }
}

/** 為使用者選取的資料夾建立存取物件。資料夾路徑在此解析成實際路徑，並記下其 (dev, ino)。 */
export async function createNodeFolderAccess(
  folderPath: string,
  options: NodeFolderAccessOptions = {},
): Promise<FolderAccess> {
  const root = await realpath(folderPath);
  const info = lstatSync(root, { bigint: true });
  if (!info.isDirectory()) throw new Error('選取的不是資料夾');
  return new NodeFolderAccess(
    root,
    identityOf(info),
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    options.maxDepth ?? DEFAULT_MAX_DEPTH,
    options.testHooks ?? {},
  );
}

interface QueuedDir {
  readonly segments: readonly string[];
  /** 根到這一層每個資料夾發現時的身分。 */
  readonly chain: readonly Identity[];
}

class NodeFolderAccess implements FolderAccess {
  readonly #root: string;
  readonly #rootId: Identity;
  readonly #maxEntries: number;
  readonly #maxDepth: number;
  readonly #hooks: NodeFolderAccessTestHooks;

  constructor(
    root: string,
    rootId: Identity,
    maxEntries: number,
    maxDepth: number,
    hooks: NodeFolderAccessTestHooks,
  ) {
    this.#root = root;
    this.#rootId = rootId;
    this.#maxEntries = maxEntries;
    this.#maxDepth = maxDepth;
    this.#hooks = hooks;
  }

  /**
   * 這一層到根是否都還是發現時的那些資料夾（非 symlink、身分相同）。
   * rootChanged：失敗的是根本身（codex 補審 ca51f0e：掃子層時根被換也要中止整份列舉）。
   */
  #dirIntact(dir: QueuedDir): { ok: true } | { ok: false; symlink: boolean; rootChanged: boolean } {
    try {
      const res = lstatDirChain(this.#root, dir.segments, dir.chain);
      return res.ok
        ? { ok: true }
        : { ok: false, symlink: res.symlink, rootChanged: res.level === 0 };
    } catch {
      // lstat 丟錯（例如某層消失）時，另外確認根是否還在原處。
      return { ok: false, symlink: false, rootChanged: !this.#rootIntact() };
    }
  }

  #rootIntact(): boolean {
    try {
      return lstatDirChain(this.#root, [], [this.#rootId]).ok;
    } catch {
      return false;
    }
  }

  async list(): Promise<RawEntry[]> {
    const out: RawEntry[] = [];
    const queue: QueuedDir[] = [{ segments: [], chain: [this.#rootId] }];
    while (queue.length > 0 && out.length < this.#maxEntries) {
      const dir = queue.shift();
      if (!dir) break;
      const rel = dir.segments.join('/');
      if (rel !== '') await this.#hooks.beforeReaddir?.(rel);
      const found = await this.#listDir(dir, this.#maxEntries - out.length);
      // 根被換掉（不論正在掃哪一層）：整份列舉都不可信。
      if (found === null) throw new Error('選取的資料夾已被移動或替換，請重新選取');
      if ('changed' in found) {
        out.push({ relPath: rel, kind: found.changed, size: 0 });
        continue;
      }
      for (const entry of found.entries) {
        if (out.length >= this.#maxEntries) break;
        out.push(entry);
      }
      for (const sub of found.subdirs) {
        if (sub.segments.length < this.#maxDepth) queue.push(sub);
      }
    }
    return out;
  }

  /**
   * 列一層：readdir 與取大小都夾在兩次身分確認之間，任一次不符就整層不採用。
   * 回傳 null 表示根資料夾不符。budget 是剩餘可回報筆數，收滿就停，不再 lstat 其餘項目
   * （codex 補審 ca51f0e）。
   */
  async #listDir(
    dir: QueuedDir,
    budget: number,
  ): Promise<
    { entries: RawEntry[]; subdirs: QueuedDir[] } | { changed: 'symlink' | 'other' } | null
  > {
    const changed = (r: { symlink: boolean; rootChanged: boolean }) =>
      r.rootChanged || dir.segments.length === 0
        ? null
        : ({ changed: r.symlink ? 'symlink' : 'other' } as const);
    const before = this.#dirIntact(dir);
    if (!before.ok) return changed(before);
    const abs = path.join(this.#root, ...dir.segments);
    let dirents;
    try {
      dirents = await readdir(abs, { withFileTypes: true });
    } catch {
      return { entries: [], subdirs: [] };
    }
    const entries: RawEntry[] = [];
    const subdirs: QueuedDir[] = [];
    for (const d of dirents) {
      if (entries.length >= budget) break;
      const rel = [...dir.segments, d.name].join('/');
      const childAbs = path.join(abs, d.name);
      if (d.isSymbolicLink()) {
        entries.push({ relPath: rel, kind: 'symlink', size: 0 });
      } else if (d.isDirectory()) {
        if (!shouldDescend(d.name)) continue;
        const st = safeLstat(childAbs);
        if (st?.isDirectory()) {
          subdirs.push({
            segments: [...dir.segments, d.name],
            chain: [...dir.chain, identityOf(st)],
          });
        }
      } else if (d.isFile()) {
        const st = safeLstat(childAbs);
        if (st?.isFile()) entries.push({ relPath: rel, kind: 'file', size: Number(st.size) });
      } else {
        entries.push({ relPath: rel, kind: 'other', size: 0 });
      }
    }
    const after = this.#dirIntact(dir);
    if (!after.ok) return changed(after);
    return { entries, subdirs };
  }

  async read(relPath: string, maxBytes: number): Promise<AccessReadResult> {
    const segments = splitRelPath(relPath);
    if (!segments) return { ok: false, reason: 'invalid_path' };
    const expected = path.join(this.#root, ...segments);
    const fail = (reason: ReadRejection): AccessReadResult => ({ ok: false, reason });

    let pre;
    try {
      pre = checkFileAt(this.#root, segments, [this.#rootId]);
    } catch (error) {
      return fail(rejectFor(error));
    }
    if (!pre.ok) return fail(pre.reason);
    if (pre.file.size > BigInt(maxBytes)) return fail('too_large');
    await this.#hooks.onReadStage?.('checked', relPath);

    let handle;
    try {
      handle = await open(expected, OPEN_FLAGS);
    } catch (error) {
      return fail(rejectFor(error));
    }
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile()) return fail('not_regular_file');
      // 開到的必須是剛才在預期路徑上確認過的那個檔案。
      if (!sameIdentity(identityOf(opened), identityOf(pre.file))) return fail('path_changed');
      if (opened.size > BigInt(maxBytes)) return fail('too_large');
      const fdPath = pathOfFd(handle.fd);
      if (fdPath !== null && fdPath !== expected) return fail('path_changed');
      await this.#hooks.onReadStage?.('opened', relPath);

      const buffer = Buffer.alloc(maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maxBytes) return fail('too_large');
      await this.#hooks.onReadStage?.('read', relPath);

      // 讀完再確認一次：預期路徑上仍是同一批資料夾、同一個檔案，才交出內容。
      const post = checkFileAt(this.#root, segments, pre.dirs);
      if (!post.ok) return fail(post.reason);
      if (!sameIdentity(identityOf(post.file), identityOf(opened))) return fail('path_changed');
      return { ok: true, bytes: new Uint8Array(buffer.subarray(0, total)) };
    } catch (error) {
      return fail(rejectFor(error));
    } finally {
      await handle.close();
    }
  }
}

function safeLstat(abs: string) {
  try {
    return lstatSync(abs, { bigint: true });
  } catch {
    return undefined;
  }
}
