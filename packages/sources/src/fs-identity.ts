/**
 * 以 (dev, ino) 確認「路徑上每一層仍是當初那個實體」的工具，供本機 FolderAccess 使用。
 *
 * Node 沒有 openat／F_GETPATH，macOS 也無法從 fd 取回實際路徑（實測 `/dev/fd/N`
 * 的 realpath 回傳的不是檔案路徑），所以這裡的檢查都是「以路徑重新解析」，不是原子的。
 * 做法是把每個關鍵檢查夾在兩次逐段 lstat 中間（三明治），讓攻擊者必須在極短時間內
 * 精準切換多次才能通過；Linux 另用 `/proc/self/fd/N` 直接從 fd 取路徑比對。
 * 殘餘風險見 P1-T008 Task「對抗驗證修正」。
 */
import { lstatSync, readlinkSync, realpathSync, type BigIntStats } from 'node:fs';
import path from 'node:path';

import type { ReadRejection } from './types.ts';

export interface Identity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export const identityOf = (s: BigIntStats): Identity => ({ dev: s.dev, ino: s.ino });

export const sameIdentity = (a: Identity, b: Identity): boolean =>
  a.dev === b.dev && a.ino === b.ino;

export type DirChainResult =
  | { readonly ok: true; readonly dirs: readonly Identity[] }
  /** level：第幾層不符（0 是根），讓呼叫端分辨「根被換」與「子層被換」。 */
  | { readonly ok: false; readonly symlink: boolean; readonly level: number };

/**
 * 逐段 lstat 根與 dirSegments 的每一層：都必須是資料夾、不是 symlink，
 * 且 (dev, ino) 等於 expected 對應的值（expected 長度可短於層數，只比對有的部分）。
 * 回傳的 dirs 第 0 個是根。
 */
export function lstatDirChain(
  root: string,
  dirSegments: readonly string[],
  expected: readonly Identity[],
): DirChainResult {
  const dirs: Identity[] = [];
  let current = root;
  for (let i = 0; i <= dirSegments.length; i += 1) {
    if (i > 0) current = path.join(current, dirSegments[i - 1] ?? '');
    const st = lstatSync(current, { bigint: true });
    if (st.isSymbolicLink()) return { ok: false, symlink: true, level: i };
    if (!st.isDirectory()) return { ok: false, symlink: false, level: i };
    const id = identityOf(st);
    const want = expected[i];
    if (want && !sameIdentity(want, id)) return { ok: false, symlink: false, level: i };
    dirs.push(id);
  }
  return { ok: true, dirs };
}

export type FileCheck =
  | { readonly ok: true; readonly dirs: readonly Identity[]; readonly file: BigIntStats }
  | { readonly ok: false; readonly reason: ReadRejection };

/** 中間層出問題時，用 realpath 判斷是「指到資料夾外」還是「資料夾內換了位置」（只影響提示原因）。 */
function classifyMoved(root: string, expected: string): ReadRejection {
  try {
    const actual = realpathSync.native(expected);
    return actual.startsWith(root + path.sep) ? 'path_changed' : 'outside_folder';
  } catch {
    return 'path_changed';
  }
}

/**
 * 確認 root/segments 目前是「一般檔、路徑上沒有 symlink、各層身分不變、
 * realpath 完全等於預期路徑」。檔案 lstat 與 realpath 都夾在兩次逐段 lstat 之間，
 * 且前後兩次看到的檔案身分必須相同。可能丟出 fs 錯誤，由呼叫端轉成拒絕原因。
 */
export function checkFileAt(
  root: string,
  segments: readonly string[],
  expectedDirs: readonly Identity[],
): FileCheck {
  const expected = path.join(root, ...segments);
  const dirSegments = segments.slice(0, -1);
  const before = lstatDirChain(root, dirSegments, expectedDirs);
  if (!before.ok) return { ok: false, reason: classifyMoved(root, expected) };
  const file = lstatSync(expected, { bigint: true });
  if (file.isSymbolicLink()) return { ok: false, reason: 'symlink' };
  if (!file.isFile()) return { ok: false, reason: 'not_regular_file' };
  // realpath.native 會還原實際大小寫，所以大小寫不敏感 FS 上用別的大小寫開到的檔也會被拒。
  if (realpathSync.native(expected) !== expected) {
    return { ok: false, reason: classifyMoved(root, expected) };
  }
  const after = lstatDirChain(root, dirSegments, before.dirs);
  if (!after.ok) return { ok: false, reason: classifyMoved(root, expected) };
  const again = lstatSync(expected, { bigint: true });
  if (!sameIdentity(identityOf(again), identityOf(file))) {
    return { ok: false, reason: 'path_changed' };
  }
  const closing = lstatDirChain(root, dirSegments, before.dirs);
  if (!closing.ok) return { ok: false, reason: classifyMoved(root, expected) };
  return { ok: true, dirs: before.dirs, file };
}

/**
 * 從 fd 本身取路徑（只有 Linux 的 /proc 做得到）。其他平台回傳 null，
 * 代表無法用這個方式確認，呼叫端只能依賴 checkFileAt 的路徑檢查。
 */
export function pathOfFd(fd: number): string | null {
  if (process.platform !== 'linux') return null;
  try {
    return readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null;
  }
}
