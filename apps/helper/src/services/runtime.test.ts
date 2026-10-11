import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { PdfExportError } from '@rolecraft/pdf-export';
import {
  createLocalFileStore,
  OrphanPdfSweepError,
  StorageError,
  sweepStorage,
  tryAcquireDataDirLock,
} from '@rolecraft/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ALLOWED } from '../__fixtures__/requests.ts';
import { ALLOWED_ORIGINS_ENV, encodeFrame, FrameDecoder } from '../index.ts';
import {
  DATA_DIR_ENV,
  DATABASE_FILE,
  DataDirInUseError,
  FILES_DIR,
  FONTS_DIR_ENV,
  openHelperRuntime,
  RuntimeConfigError,
  runtimeConfigFromEnv,
} from './runtime.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-helper-runtime-'));
  dirs.push(dir);
  return dir;
}

/** 把檔案修改時間改到寬限期之前（ORPHAN_PDF_GRACE_MS 為 15 分鐘）。 */
function ageFile(dataDir: string, hash: string): void {
  const old = new Date(Date.now() - 16 * 60 * 1000);
  utimesSync(path.join(dataDir, FILES_DIR, 'sha256', hash.slice(0, 2), hash), old, old);
}

const FONTS = { regular: new Uint8Array([1]), bold: new Uint8Array([2]) };

describe('runtimeConfigFromEnv：資料區位置只從環境變數讀', () => {
  it('都沒設：null（依賴儲存的服務不接）', () => {
    expect(runtimeConfigFromEnv({})).toBeNull();
  });

  it('兩個都是絕對路徑：採用', () => {
    expect(
      runtimeConfigFromEnv({ [DATA_DIR_ENV]: '/a/data', [FONTS_DIR_ENV]: '/a/fonts/' }),
    ).toEqual({ dataDir: '/a/data', fontsDir: '/a/fonts/' });
  });

  it.each([
    [{ [DATA_DIR_ENV]: '/a/data' }],
    [{ [FONTS_DIR_ENV]: '/a/fonts' }],
    [{ [DATA_DIR_ENV]: 'data', [FONTS_DIR_ENV]: '/a/fonts' }],
    [{ [DATA_DIR_ENV]: '/a/data', [FONTS_DIR_ENV]: '' }],
  ])('只設一個、相對路徑或空字串：拒絕 %o', (env) => {
    expect(() => runtimeConfigFromEnv(env)).toThrow(RuntimeConfigError);
  });
});

describe('openHelperRuntime：啟動時清掃一次（sweepStorage）', () => {
  it('開啟時恰好呼叫一次 sweepStorage，帶入同一個資料庫與檔案儲存區', () => {
    const sweep = vi.fn(sweepStorage);
    const runtime = openHelperRuntime({ dataDir: tempDir(), fontsDir: '/f' }, { sweep });
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(sweep).toHaveBeenCalledWith(runtime.db, runtime.fileStore, { orphanGrace: true });
    runtime.close();
  });

  it('真實清掃：超過寬限期的孤兒 PDF 清掉；剛寫入的（可能是其他行程匯出中）保留', () => {
    const dataDir = tempDir();
    const first = openHelperRuntime({ dataDir, fontsDir: '/f' });
    const old = first.fileStore.put(new TextEncoder().encode('%PDF old orphan'));
    const fresh = first.fileStore.put(new TextEncoder().encode('%PDF fresh'));
    first.close();
    ageFile(dataDir, old.hash);
    const second = openHelperRuntime({ dataDir, fontsDir: '/f' });
    expect(second.sweep.releasedPdfHashes).toEqual([old.hash]);
    expect(second.fileStore.has(old.hash)).toBe(false);
    expect(second.fileStore.has(fresh.hash)).toBe(true);
    second.close();
  });

  it('清掃失敗：關閉資料庫並拋出（不帶著未清掃的資料區上線）', () => {
    let captured: { isOpen: boolean } | undefined;
    const sweep = vi.fn((db: Parameters<typeof sweepStorage>[0]) => {
      captured = db;
      throw new Error('sweep failed');
    });
    expect(() => openHelperRuntime({ dataDir: tempDir(), fontsDir: '/f' }, { sweep })).toThrow(
      'sweep failed',
    );
    expect(captured?.isOpen).toBe(false);
  });

  it('資料區鎖（裁定 #13）：開著時第二個 openHelperRuntime 拋 DataDirInUseError；close 後可再開', () => {
    const dataDir = tempDir();
    const first = openHelperRuntime({ dataDir, fontsDir: '/f' });
    const sweep = vi.fn(sweepStorage);
    expect(() => openHelperRuntime({ dataDir, fontsDir: '/f' }, { sweep })).toThrow(
      DataDirInUseError,
    );
    expect(sweep).not.toHaveBeenCalled(); // 沒拿到鎖就不清掃
    first.close();
    first.close(); // 重複關閉無害
    const second = openHelperRuntime({ dataDir, fontsDir: '/f' });
    expect(tryAcquireDataDirLock(dataDir)).toBeNull();
    second.close();
    const lock = tryAcquireDataDirLock(dataDir);
    expect(lock).not.toBeNull();
    lock?.release();
  });

  it('鎖被占用：不建立資料庫檔', () => {
    const dataDir = tempDir();
    const lock = tryAcquireDataDirLock(dataDir);
    expect(() => openHelperRuntime({ dataDir, fontsDir: '/f' })).toThrow(DataDirInUseError);
    expect(existsSync(path.join(dataDir, DATABASE_FILE))).toBe(false);
    lock?.release();
  });

  it('清掃失敗（已清除素材的 PDF 刪不掉等）：照拋且放鎖', () => {
    const dataDir = tempDir();
    const sweep = vi.fn(() => {
      throw new StorageError('purge failed');
    });
    expect(() => openHelperRuntime({ dataDir, fontsDir: '/f' }, { sweep })).toThrow(StorageError);
    const lock = tryAcquireDataDirLock(dataDir);
    expect(lock).not.toBeNull();
    lock?.release();
  });

  it('只有一般孤兒 PDF 刪不掉（裁定 #14）：照常開啟，帶已完成的清掃結果與 orphanSweepFailed', () => {
    const partial = { purgedExportVersionIds: ['v1'], releasedPdfHashes: [] };
    const sweep = vi.fn(() => {
      throw new OrphanPdfSweepError(partial, { cause: new AggregateError([]) });
    });
    const runtime = openHelperRuntime({ dataDir: tempDir(), fontsDir: '/f' }, { sweep });
    expect(runtime.orphanSweepFailed).toBe(true);
    expect(runtime.sweep).toEqual(partial);
    expect(runtime.db.isOpen).toBe(true);
    runtime.close();
  });

  it('字型：成功後快取；失敗不快取，下次重讀', async () => {
    const loadFonts = vi
      .fn<(dir: string) => Promise<typeof FONTS>>()
      .mockRejectedValueOnce(new PdfExportError('fonts_unavailable', 'x'))
      .mockResolvedValue(FONTS);
    const runtime = openHelperRuntime({ dataDir: tempDir(), fontsDir: '/fonts' }, { loadFonts });
    await expect(runtime.loadFonts()).rejects.toThrow(PdfExportError);
    expect(await runtime.loadFonts()).toBe(FONTS);
    expect(await runtime.loadFonts()).toBe(FONTS);
    expect(loadFonts).toHaveBeenCalledTimes(2);
    expect(loadFonts).toHaveBeenCalledWith('/fonts');
    runtime.close();
  });
});

const MAIN = path.join(import.meta.dirname, '..', 'main.ts');

function runMain(env: Record<string, string>, stdin: Buffer) {
  return new Promise<{ code: number | null; replies: unknown[] }>((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN, ALLOWED], { env, stdio: 'pipe' });
    const decoder = new FrameDecoder();
    const replies: unknown[] = [];
    child.stdout.on('data', (chunk: Buffer) => replies.push(...decoder.push(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, replies }));
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

describe('main（真實子行程）：資料區接線', () => {
  const list = encodeFrame({ id: 'l1', request: { op: 'export.list_versions', payload: {} } });

  it('設定資料區：啟動時清掃孤兒 PDF，export.list_versions 接上服務', async () => {
    const dataDir = tempDir();
    const orphan = createLocalFileStore(path.join(dataDir, FILES_DIR)).put(
      new TextEncoder().encode('%PDF orphan'),
    );
    ageFile(dataDir, orphan.hash);
    const env = {
      [ALLOWED_ORIGINS_ENV]: ALLOWED,
      [DATA_DIR_ENV]: dataDir,
      [FONTS_DIR_ENV]: path.join(dataDir, 'fonts'),
    };
    const result = await runMain(env, list);
    expect(result.code).toBe(0);
    expect(result.replies).toEqual([{ id: 'l1', response: { ok: true, versions: [] } }]);
    expect(createLocalFileStore(path.join(dataDir, FILES_DIR)).has(orphan.hash)).toBe(false);
  });

  it('資料區設定錯（相對路徑）或資料夾不存在：結束碼 1、不回覆', async () => {
    const base = { [ALLOWED_ORIGINS_ENV]: ALLOWED, [FONTS_DIR_ENV]: '/f' };
    for (const dataDir of ['relative/dir', path.join(tempDir(), 'missing', 'deeper')]) {
      const result = await runMain({ ...base, [DATA_DIR_ENV]: dataDir }, list);
      expect(result.code).toBe(1);
      expect(result.replies).toEqual([]);
    }
  });
});
