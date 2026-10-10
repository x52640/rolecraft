/**
 * FolderAccess 的本機檔案系統實作（helper 直接讀資料夾的機制）。
 *
 * - 列舉：不跟隨符號連結（symlink 只回報、不進入），因此資料夾內的 symlink 迴圈不會無限走。
 * - 讀取：lstat → O_NOFOLLOW 開檔 → fstat 確認一般檔 → realpath 必須「完全等於」
 *   資料夾實際路徑＋相對路徑 → realpath 指到的檔案與 fd 是同一個 inode。
 *   最後一步讓「開檔前後把檔案或中間資料夾換成 symlink」的 TOCTOU 也會被拒。
 */
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { shouldDescend } from './filter.ts';
import { splitRelPath } from './path-rules.ts';
import type { AccessReadResult, FolderAccess, RawEntry, ReadRejection } from './types.ts';

export interface NodeFolderAccessOptions {
  /** 最多回報幾筆項目，避免巨大資料夾拖垮預覽。 */
  readonly maxEntries?: number;
  readonly maxDepth?: number;
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

/** 為使用者選取的資料夾建立存取物件。資料夾路徑在此解析成實際路徑並固定。 */
export async function createNodeFolderAccess(
  folderPath: string,
  options: NodeFolderAccessOptions = {},
): Promise<FolderAccess> {
  const root = await realpath(folderPath);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error('選取的不是資料夾');
  return new NodeFolderAccess(
    root,
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    options.maxDepth ?? DEFAULT_MAX_DEPTH,
  );
}

class NodeFolderAccess implements FolderAccess {
  readonly #root: string;
  readonly #maxEntries: number;
  readonly #maxDepth: number;

  constructor(root: string, maxEntries: number, maxDepth: number) {
    this.#root = root;
    this.#maxEntries = maxEntries;
    this.#maxDepth = maxDepth;
  }

  async list(): Promise<RawEntry[]> {
    const out: RawEntry[] = [];
    const queue: { abs: string; rel: string; depth: number }[] = [
      { abs: this.#root, rel: '', depth: 0 },
    ];
    while (queue.length > 0 && out.length < this.#maxEntries) {
      const dir = queue.shift();
      if (!dir) break;
      let dirents;
      try {
        dirents = await readdir(dir.abs, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirents) {
        if (out.length >= this.#maxEntries) break;
        const rel = dir.rel === '' ? d.name : `${dir.rel}/${d.name}`;
        const abs = path.join(dir.abs, d.name);
        if (d.isSymbolicLink()) {
          out.push({ relPath: rel, kind: 'symlink', size: 0 });
        } else if (d.isDirectory()) {
          if (shouldDescend(d.name) && dir.depth + 1 < this.#maxDepth) {
            queue.push({ abs, rel, depth: dir.depth + 1 });
          }
        } else if (d.isFile()) {
          const size = await lstat(abs).then(
            (s) => (s.isFile() ? s.size : -1),
            () => -1,
          );
          if (size >= 0) out.push({ relPath: rel, kind: 'file', size });
        } else {
          out.push({ relPath: rel, kind: 'other', size: 0 });
        }
      }
    }
    return out;
  }

  async read(relPath: string, maxBytes: number): Promise<AccessReadResult> {
    const segments = splitRelPath(relPath);
    if (!segments) return { ok: false, reason: 'invalid_path' };
    const expected = path.join(this.#root, ...segments);
    try {
      const before = await lstat(expected);
      if (before.isSymbolicLink()) return { ok: false, reason: 'symlink' };
      if (!before.isFile()) return { ok: false, reason: 'not_regular_file' };
      if (before.size > maxBytes) return { ok: false, reason: 'too_large' };
    } catch (error) {
      return { ok: false, reason: rejectFor(error) };
    }

    let handle;
    try {
      handle = await open(expected, OPEN_FLAGS);
    } catch (error) {
      return { ok: false, reason: rejectFor(error) };
    }
    try {
      const opened = await handle.stat();
      if (!opened.isFile()) return { ok: false, reason: 'not_regular_file' };
      if (opened.size > maxBytes) return { ok: false, reason: 'too_large' };
      const actual = await realpath(expected);
      if (actual !== expected) {
        const inside = actual.startsWith(this.#root + path.sep);
        return { ok: false, reason: inside ? 'path_changed' : 'outside_folder' };
      }
      const atPath = await stat(actual);
      if (atPath.dev !== opened.dev || atPath.ino !== opened.ino) {
        return { ok: false, reason: 'path_changed' };
      }
      const buffer = Buffer.alloc(maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maxBytes) return { ok: false, reason: 'too_large' };
      return { ok: true, bytes: new Uint8Array(buffer.subarray(0, total)) };
    } catch (error) {
      return { ok: false, reason: rejectFor(error) };
    } finally {
      await handle.close();
    }
  }
}
