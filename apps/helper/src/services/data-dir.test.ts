import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BridgeOperation } from '@rolecraft/contracts';
import { OrphanPdfSweepError, sweepStorage, tryAcquireDataDirLock } from '@rolecraft/storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordingLogger } from '../__fixtures__/requests.ts';
import { dispatch } from '../bridge/dispatch.ts';
import type { HelperServices } from '../handlers/services.ts';
import { createServices } from '../main.ts';
import {
  connectDataDir,
  DATA_DIR_IN_USE_MESSAGE,
  needsStorage,
  STORAGE_FREE_GROUPS,
  type DataDirDeps,
} from './data-dir.ts';
import { DATABASE_FILE, openHelperRuntime, type HelperRuntime } from './runtime.ts';

const dirs: string[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

function config() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rolecraft-data-dir-'));
  dirs.push(dataDir);
  return { dataDir, fontsDir: '/f' };
}

/** 測試用組裝：真的 createServices（不開對話框），記下開過的 runtime 以便收尾。 */
function deps(extra: Partial<DataDirDeps> = {}) {
  const runtimes: HelperRuntime[] = [];
  const notices: string[] = [];
  const value: DataDirDeps = {
    assemble: (runtime, base) => {
      runtimes.push(runtime);
      cleanups.push(() => runtime.close());
      return createServices(runtime, {}, base);
    },
    withoutStorage: () => createServices(null, {}),
    notice: (n) => notices.push(n),
    ...extra,
  };
  return { value, runtimes, notices };
}

function holdLock(dataDir: string) {
  const lock = tryAcquireDataDirLock(dataDir);
  if (!lock) throw new Error('lock busy');
  cleanups.push(() => lock.release());
  return lock;
}

const send = (services: HelperServices, op: string, payload: unknown = {}) =>
  dispatch({ op, payload }, services, recordingLogger()).then((r) => r.response);

const IN_USE = {
  ok: false,
  error: { code: 'helper_unavailable', message: DATA_DIR_IN_USE_MESSAGE },
};

describe('needsStorage：只有 providers、sources 不需要儲存', () => {
  it('與沒有資料區時 createServices 接上的群組一致', () => {
    expect(Object.keys(createServices(null, {})).sort()).toEqual([...STORAGE_FREE_GROUPS].sort());
  });

  it.each(BridgeOperation.options)('%s', (op) => {
    const group = op.includes('.') ? op.split('.')[0] : 'capture';
    expect(needsStorage(op)).toBe(group !== 'providers' && group !== 'sources');
  });
});

describe('connectDataDir（裁定 #13）', () => {
  it('沒被占用：開資料區、組裝完整服務，不記占用', async () => {
    const d = deps();
    const services = connectDataDir(config(), d.value);
    expect(d.runtimes).toHaveLength(1);
    expect(d.notices).toEqual([]);
    expect(await send(services, 'export.list_versions')).toEqual({ ok: true, versions: [] });
  });

  it('被另一個 helper 占用：不開資料庫；需要儲存的操作回固定 helper_unavailable，其他照常', async () => {
    const cfg = config();
    holdLock(cfg.dataDir);
    const open = vi.fn(openHelperRuntime);
    const d = deps({ open });
    const started = Date.now();
    const services = connectDataDir(cfg, d.value);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1500); // 啟動時先短暫等對方放鎖
    expect(d.notices).toEqual(['data_dir_in_use']);
    expect(d.runtimes).toEqual([]);
    expect(existsSync(path.join(cfg.dataDir, DATABASE_FILE))).toBe(false);
    for (const op of [
      'export.list_versions',
      'jobs.list',
      'applications.list',
      'claims.list_projects',
    ]) {
      expect(await send(services, op)).toEqual(IN_USE);
    }
    expect(await send(services, 'sources.list_folders')).toMatchObject({ ok: true });
    expect(await send(services, 'providers.status')).toMatchObject({ ok: true });
    // 不需儲存的操作不重試取得鎖
    const calls = open.mock.calls.length;
    await send(services, 'sources.list_folders');
    expect(open.mock.calls.length).toBe(calls);
    expect(existsSync(path.join(cfg.dataDir, DATABASE_FILE))).toBe(false);
  }, 20_000);

  it('占用的 helper 結束後：下一個需要儲存的操作接手，沿用原本的 sources／providers', async () => {
    const cfg = config();
    const lock = holdLock(cfg.dataDir);
    const project = path.join(cfg.dataDir, '專案甲');
    mkdirSync(project);
    const folder = () => Promise.resolve([project]);
    const d = deps({
      open: (c, o) => openHelperRuntime(c, { ...o, lockWaitMs: 0 }),
      withoutStorage: () => createServices(null, { folder }),
    });
    const services = connectDataDir(cfg, d.value);
    expect(await send(services, 'jobs.list')).toEqual(IN_USE);
    // 占用期間加入的資料夾（記憶體狀態），接手後仍在
    expect(await send(services, 'sources.pick_folders')).toMatchObject({ ok: true });
    lock.release();
    expect(await send(services, 'jobs.list')).toEqual({ ok: true, snapshots: [] });
    expect(d.runtimes).toHaveLength(1);
    // 已接手：之後不再重開
    expect(await send(services, 'export.list_versions')).toEqual({ ok: true, versions: [] });
    expect(d.runtimes).toHaveLength(1);
    expect(await send(services, 'sources.list_folders')).toMatchObject({
      ok: true,
      roots: [expect.objectContaining({ name: '專案甲' })],
    });
    // 接手的 helper 持有鎖：別人拿不到
    expect(tryAcquireDataDirLock(cfg.dataDir)).toBeNull();
  });

  it('接手時清掃失敗（已清除素材的 PDF 刪不掉）：回 internal_error、不接手、放鎖，下次再試', async () => {
    const cfg = config();
    const lock = holdLock(cfg.dataDir);
    let fail = true;
    const sweep: typeof sweepStorage = (...args) => {
      if (fail) throw new Error('D19 delete failed');
      return sweepStorage(...args);
    };
    const d = deps({ open: (c, o) => openHelperRuntime(c, { ...o, lockWaitMs: 0, sweep }) });
    const services = connectDataDir(cfg, d.value);
    lock.release();
    expect(await send(services, 'jobs.list')).toMatchObject({
      ok: false,
      error: { code: 'internal_error' },
    });
    const probe = tryAcquireDataDirLock(cfg.dataDir);
    expect(probe).not.toBeNull(); // 失敗後鎖已放
    probe?.release();
    fail = false;
    expect(await send(services, 'jobs.list')).toEqual({ ok: true, snapshots: [] });
  });

  it('只有一般孤兒 PDF 刪不掉：記 orphan_pdf_sweep_failed、照常上線（裁定 #14）', async () => {
    const sweep: typeof sweepStorage = () => {
      throw new OrphanPdfSweepError(
        { purgedExportVersionIds: [], releasedPdfHashes: [] },
        { cause: new AggregateError([]) },
      );
    };
    const d = deps({ open: (c, o) => openHelperRuntime(c, { ...o, sweep }) });
    const services = connectDataDir(config(), d.value);
    expect(d.notices).toEqual(['orphan_pdf_sweep_failed']);
    expect(d.runtimes[0]?.orphanSweepFailed).toBe(true);
    expect(await send(services, 'jobs.list')).toEqual({ ok: true, snapshots: [] });
  });

  it('組裝失敗：關掉 runtime（放鎖）再拋', () => {
    const cfg = config();
    const d = deps({
      assemble: (runtime) => {
        d.runtimes.push(runtime);
        throw new Error('assemble failed');
      },
    });
    expect(() => connectDataDir(cfg, d.value)).toThrow('assemble failed');
    expect(d.runtimes[0]?.db.isOpen).toBe(false);
    const probe = tryAcquireDataDirLock(cfg.dataDir);
    expect(probe).not.toBeNull();
    probe?.release();
  });
});
