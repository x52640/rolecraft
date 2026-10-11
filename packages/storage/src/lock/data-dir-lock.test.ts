import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { DATA_DIR_LOCK_FILE, tryAcquireDataDirLock } from './data-dir-lock.ts';

const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  children.splice(0).forEach((child) => child.kill('SIGKILL'));
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-lock-'));
  dirs.push(dir);
  return dir;
}

const MODULE = path.join(import.meta.dirname, 'data-dir-lock.ts');

/** 另一個行程：取得鎖後印出 locked／busy，然後一直掛著（直到被結束或 stdin 關閉）。 */
function holderProcess(dataDir: string): Promise<{ child: ChildProcess; status: string }> {
  const script = `
    import { tryAcquireDataDirLock } from ${JSON.stringify(MODULE)};
    const lock = tryAcquireDataDirLock(${JSON.stringify(dataDir)});
    process.stdout.write(lock ? 'locked\\n' : 'busy\\n');
    process.stdin.on('end', () => { lock?.release(); process.exit(0); });
    process.stdin.resume();
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' });
  children.push(child);
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('error', reject);
    child.stderr.resume();
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
      if (out.includes('\n')) resolve({ child, status: out.trim() });
    });
  });
}

function exited(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
}

describe('tryAcquireDataDirLock（裁定 #13）', () => {
  it('同一資料區：第一個拿到，第二個（同行程）拿不到；放鎖後可再取得', () => {
    const dir = tempDir();
    const first = tryAcquireDataDirLock(dir);
    expect(first).not.toBeNull();
    expect(tryAcquireDataDirLock(dir)).toBeNull();
    first?.release();
    first?.release(); // 重複放鎖無害
    const again = tryAcquireDataDirLock(dir);
    expect(again).not.toBeNull();
    again?.release();
  });

  it('不同資料區互不影響', () => {
    const a = tryAcquireDataDirLock(tempDir());
    const b = tryAcquireDataDirLock(tempDir());
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    a?.release();
    b?.release();
  });

  it('等待期間對方沒放：等滿 waitMs 後回 null（不拋）', () => {
    const dir = tempDir();
    const held = tryAcquireDataDirLock(dir);
    const started = Date.now();
    expect(tryAcquireDataDirLock(dir, { waitMs: 150 })).toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    held?.release();
  });

  it('兩個行程：另一個行程持有時拿不到；對方正常結束後拿得到', async () => {
    const dir = tempDir();
    const holder = await holderProcess(dir);
    expect(holder.status).toBe('locked');
    expect(tryAcquireDataDirLock(dir)).toBeNull();
    holder.child.stdin?.end();
    await exited(holder.child);
    const mine = tryAcquireDataDirLock(dir);
    expect(mine).not.toBeNull();
    // 反過來：本行程持有時，另一個行程拿不到
    const other = await holderProcess(dir);
    expect(other.status).toBe('busy');
    mine?.release();
  });

  it('持有者被強制結束（SIGKILL，模擬當掉）：作業系統放鎖，可直接接手', async () => {
    const dir = tempDir();
    const holder = await holderProcess(dir);
    expect(holder.status).toBe('locked');
    expect(tryAcquireDataDirLock(dir)).toBeNull();
    holder.child.kill('SIGKILL');
    await exited(holder.child);
    const mine = tryAcquireDataDirLock(dir);
    expect(mine).not.toBeNull();
    mine?.release();
  });

  it('資料夾不存在、鎖檔被換成非 SQLite 檔：拋出（不是「被占用」）', () => {
    expect(() => tryAcquireDataDirLock(path.join(tempDir(), 'missing', 'deeper'))).toThrow();
    const dir = tempDir();
    writeFileSync(path.join(dir, DATA_DIR_LOCK_FILE), 'not a database '.repeat(100));
    expect(() => tryAcquireDataDirLock(dir)).toThrow();
  });
});
