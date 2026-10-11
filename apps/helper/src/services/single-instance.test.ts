// 端到端（真實 helper 子行程）：一個資料區只准一個 helper（裁定 #13）、孤兒 PDF 刪不掉不擋啟動（裁定 #14）。
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { createLocalFileStore } from '@rolecraft/storage';
import { afterEach, describe, expect, it } from 'vitest';

import { ALLOWED } from '../__fixtures__/requests.ts';
import { ALLOWED_ORIGINS_ENV, encodeFrame, FrameDecoder } from '../index.ts';
import { DATA_DIR_IN_USE_MESSAGE } from './data-dir.ts';
import { DATA_DIR_ENV, DATABASE_FILE, FILES_DIR, FONTS_DIR_ENV } from './runtime.ts';

const MAIN = path.join(import.meta.dirname, '..', 'main.ts');

const dirs: string[] = [];
const children: ChildProcess[] = [];
const restores: (() => void)[] = [];
afterEach(() => {
  children.splice(0).forEach((child) => child.kill('SIGKILL'));
  restores.splice(0).forEach((fn) => fn());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-single-'));
  dirs.push(dir);
  return dir;
}

function envFor(dataDir: string): Record<string, string> {
  return {
    [ALLOWED_ORIGINS_ENV]: ALLOWED,
    [DATA_DIR_ENV]: dataDir,
    [FONTS_DIR_ENV]: path.join(dataDir, 'fonts'),
  };
}

const frame = (id: string, op: string) => encodeFrame({ id, request: { op, payload: {} } });

/** 啟動一個 helper，stdin 先不關；回傳送請求、等回覆、結束的控制器。 */
function startHelper(env: Record<string, string>) {
  const child = spawn(process.execPath, [MAIN, ALLOWED], { env, stdio: 'pipe' });
  children.push(child);
  const decoder = new FrameDecoder();
  const replies: unknown[] = [];
  const waiters: (() => void)[] = [];
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    replies.push(...decoder.push(chunk));
    waiters.splice(0).forEach((w) => w());
  });
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.on('error', () => {});
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve));
  return {
    replies,
    stderr: () => stderr,
    send(buffer: Buffer) {
      child.stdin.write(buffer);
    },
    async waitFor(count: number) {
      while (replies.length < count) await new Promise<void>((r) => waiters.push(r));
    },
    end() {
      child.stdin.end();
      return closed;
    },
  };
}

const IN_USE = {
  ok: false,
  error: { code: 'helper_unavailable', message: DATA_DIR_IN_USE_MESSAGE },
};

describe('兩個 helper 共用一個資料區（裁定 #13）', () => {
  it('第二個不退出、不開儲存；需要儲存的回固定訊息，其他照常；第一個結束後第二個接手', async () => {
    const dataDir = tempDir();
    const first = startHelper(envFor(dataDir));
    first.send(frame('a1', 'export.list_versions'));
    await first.waitFor(1);
    expect(first.replies).toEqual([{ id: 'a1', response: { ok: true, versions: [] } }]);

    const second = startHelper(envFor(dataDir));
    second.send(frame('b1', 'export.list_versions'));
    second.send(frame('b2', 'providers.status'));
    await second.waitFor(2);
    expect(second.replies).toEqual(
      expect.arrayContaining([
        { id: 'b1', response: IN_USE },
        { id: 'b2', response: expect.objectContaining({ ok: true }) as unknown },
      ]),
    );
    expect(second.stderr()).toContain('data_dir_in_use');
    expect(second.stderr()).not.toContain(dataDir);

    // 第一個正常結束（瀏覽器關掉）→ 第二個的下一個需要儲存的操作接手
    expect(await first.end()).toBe(0);
    second.send(frame('b3', 'jobs.list'));
    await second.waitFor(3);
    expect(second.replies[2]).toEqual({ id: 'b3', response: { ok: true, snapshots: [] } });
    expect(await second.end()).toBe(0);
  }, 30_000);

  it('資料區被占用時不建立資料庫檔', async () => {
    const dataDir = tempDir();
    const first = startHelper(envFor(dataDir));
    first.send(frame('a1', 'providers.status'));
    await first.waitFor(1);
    rmSync(path.join(dataDir, DATABASE_FILE), { force: true });
    rmSync(path.join(dataDir, `${DATABASE_FILE}-wal`), { force: true });
    rmSync(path.join(dataDir, `${DATABASE_FILE}-shm`), { force: true });
    // 第一個開著時資料庫檔已被它開啟；刪掉後看第二個會不會自己建
    const second = startHelper(envFor(dataDir));
    second.send(frame('b1', 'jobs.list'));
    await second.waitFor(1);
    expect(second.replies[0]).toEqual({ id: 'b1', response: IN_USE });
    expect(existsSync(path.join(dataDir, DATABASE_FILE))).toBe(false);
    await second.end();
    await first.end();
  }, 30_000);
});

describe('啟動清掃：一般孤兒 PDF 刪不掉（裁定 #14）', () => {
  it('記固定日誌（不含路徑與雜湊）、照常上線；恢復後下次啟動刪掉', async () => {
    const dataDir = tempDir();
    const store = createLocalFileStore(path.join(dataDir, FILES_DIR));
    const orphan = store.put(new TextEncoder().encode('%PDF stuck orphan'));
    const shard = path.join(dataDir, FILES_DIR, 'sha256', orphan.hash.slice(0, 2));
    const old = new Date(Date.now() - 16 * 60 * 1000);
    utimesSync(path.join(shard, orphan.hash), old, old);
    chmodSync(shard, 0o555); // 刪不掉檔（資料夾不可寫）
    restores.push(() => chmodSync(shard, 0o755));

    const helper = startHelper(envFor(dataDir));
    helper.send(frame('o1', 'export.list_versions'));
    await helper.waitFor(1);
    expect(helper.replies).toEqual([{ id: 'o1', response: { ok: true, versions: [] } }]);
    expect(helper.stderr()).toContain('orphan_pdf_sweep_failed');
    expect(helper.stderr()).not.toContain(orphan.hash);
    expect(helper.stderr()).not.toContain(dataDir);
    expect(await helper.end()).toBe(0);
    expect(store.has(orphan.hash)).toBe(true);

    chmodSync(shard, 0o755);
    const next = startHelper(envFor(dataDir));
    next.send(frame('o2', 'export.list_versions'));
    await next.waitFor(1);
    expect(next.stderr()).not.toContain('orphan_pdf_sweep_failed');
    expect(store.has(orphan.hash)).toBe(false);
    await next.end();
  }, 30_000);
});
