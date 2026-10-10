import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 測試專用：以 node 代替官方 CLI 跑真實子程序。
 * assertExecutablePath 拒絕名為 node 的執行檔，所以建一個名為 fake-cli 的符號連結指向目前的 node。
 * 只供測試使用，不從套件入口匯出。
 */
let cached: string | undefined;

export function nodeAsCli(): string {
  if (cached === undefined) {
    const dir = mkdtempSync(join(tmpdir(), 'rolecraft-fake-cli-'));
    cached = join(dir, 'fake-cli');
    symlinkSync(process.execPath, cached);
  }
  return cached;
}
