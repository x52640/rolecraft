/** 測試用：暫存資料夾、spy 存取、檔案系統大小寫偵測。 */
import { mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FolderAccess } from '../types.ts';

export interface TmpWorld {
  /** 使用者選的專案資料夾 */
  readonly project: string;
  /** 資料夾外的位置 */
  readonly outside: string;
  write(rel: string, content: string | Uint8Array, base?: string): Promise<string>;
  cleanup(): Promise<void>;
}

export async function makeWorld(): Promise<TmpWorld> {
  const base = await realpath(await mkdtemp(path.join(tmpdir(), 'rolecraft-sources-')));
  const project = path.join(base, 'project');
  const outside = path.join(base, 'outside');
  await mkdir(project);
  await mkdir(outside);
  return {
    project,
    outside,
    async write(rel, content, root = project) {
      const abs = path.join(root, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
      return abs;
    },
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

/** 包一層記錄 read 呼叫，用來證明「沒有碰到內容」。 */
export function spyAccess(inner: FolderAccess): FolderAccess & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    list: () => inner.list(),
    read: (relPath, maxBytes) => {
      reads.push(relPath);
      return inner.read(relPath, maxBytes);
    },
  };
}

/** 資料夾所在檔案系統是否大小寫不敏感（macOS 預設 APFS 是）。 */
export async function isCaseInsensitive(dir: string): Promise<boolean> {
  const probe = path.join(dir, 'CaseProbe.tmp');
  await writeFile(probe, 'x');
  try {
    await stat(path.join(dir, 'caseprobe.tmp'));
    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { force: true });
  }
}
