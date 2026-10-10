import { constants } from 'node:fs';
import { access, lstat, open, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { CLAUDE_MANAGED_SETTINGS_PATHS } from './constants.ts';

/**
 * 找官方 Claude CLI（D11 macOS 先）。只看固定候選路徑，不搜尋 PATH（PATH 可被環境左右）。
 * 回傳解開符號連結後的實際檔案，並要求是原生執行檔（Mach-O／ELF）：
 * 不接受 `#!` 腳本（例如 npm 版經 node 啟動），避免繞過 assertExecutablePath 的直譯器檢查。
 */

export function defaultClaudeCandidates(): string[] {
  return [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
}

const NATIVE_MAGIC = new Set([
  'feedfacf', // Mach-O 64 位元（big-endian 寫法）
  'cffaedfe', // Mach-O 64 位元（little-endian）
  'feedface',
  'cefaedfe',
  'cafebabe', // Mach-O universal
  'bebafeca',
  '7f454c46', // ELF
]);

async function isNativeExecutable(path: string): Promise<boolean> {
  const info = await stat(path);
  if (!info.isFile()) return false;
  await access(path, constants.X_OK);
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);
    return bytesRead === 4 && NATIVE_MAGIC.has(buffer.toString('hex'));
  } finally {
    await handle.close();
  }
}

/** 依序找第一個存在的原生執行檔；回傳實際路徑（已解開符號連結）。 */
export async function locateClaude(
  candidates: readonly string[] = defaultClaudeCandidates(),
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const real = await realpath(candidate);
      if (await isNativeExecutable(real)) return real;
    } catch {
      // 不存在或不可執行：試下一個
    }
  }
  return null;
}

/** 回傳存在的受管設定路徑（存在就無法確認，ADR-0002 R6-2）。 */
export async function findManagedSettings(
  paths: readonly string[] = CLAUDE_MANAGED_SETTINGS_PATHS,
): Promise<string[]> {
  const found: string[] = [];
  for (const path of paths) {
    try {
      await lstat(path);
      found.push(path);
    } catch (error) {
      // 只有「確定不存在」才放行；權限不足等其他錯誤視為存在（無法確認，fail-closed）。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') found.push(path);
    }
  }
  return found;
}
