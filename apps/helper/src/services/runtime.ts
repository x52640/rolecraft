// helper 啟動時的共用資源（P1-T040）：本機資料庫、檔案儲存區、隨附字型位置。
// 位置只從環境變數讀（安裝程式寫進 host 包裝檔，與允許清單同一處），請求內容永遠不會變成路徑（R7）。
// 開啟時先取得資料區鎖（裁定 #13：同一資料區只准一個 helper），再呼叫一次 sweepStorage（D19 補救清掃）。
import path from 'node:path';

import { loadBundledFonts, type FontSet } from '@rolecraft/pdf-export';
import {
  createExportVersionRepository,
  createLocalFileStore,
  createRepositories,
  openDatabase,
  OrphanPdfSweepError,
  sweepStorage,
  tryAcquireDataDirLock,
  type ExportVersionRepository,
  type FileStore,
  type OpenedDatabase,
  type Repositories,
  type StorageSweep,
} from '@rolecraft/storage';

/** 資料夾：資料庫檔＋檔案儲存區。 */
export const DATA_DIR_ENV = 'ROLECRAFT_DATA_DIR';
/** 隨附字型資料夾（Noto Sans TC 400／700＋授權檔，P1-T031 打包）。 */
export const FONTS_DIR_ENV = 'ROLECRAFT_FONTS_DIR';

export const DATABASE_FILE = 'rolecraft.sqlite';
export const FILES_DIR = 'files';

export interface RuntimeConfig {
  readonly dataDir: string;
  readonly fontsDir: string;
}

export interface HelperRuntime {
  readonly db: OpenedDatabase['db'];
  readonly fileStore: FileStore;
  readonly repos: Repositories;
  readonly exports: ExportVersionRepository;
  /** 啟動清掃的結果 */
  readonly sweep: StorageSweep;
  /** 啟動清掃有一般孤兒 PDF 刪不掉（裁定 #14：只記錄、照常啟動，下次清掃再試） */
  readonly orphanSweepFailed: boolean;
  /** 讀隨附字型（第一次讀後快取；失敗不快取，下次重讀） */
  loadFonts(): Promise<FontSet>;
  /** 關資料庫並放掉資料區鎖 */
  close(): void;
}

export class RuntimeConfigError extends Error {
  override readonly name = 'RuntimeConfigError';
}

/** 資料區鎖被另一個仍在執行的 helper 持有（裁定 #13）：沒有開資料庫、沒有清掃。 */
export class DataDirInUseError extends Error {
  override readonly name = 'DataDirInUseError';
  constructor() {
    super('資料區正由另一個 helper 使用');
  }
}

function absoluteDir(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '' || !path.isAbsolute(value)) {
    throw new RuntimeConfigError(`${name} 必須是絕對路徑`);
  }
  return path.normalize(value);
}

/**
 * 從環境變數讀設定。兩個都沒設 → null（尚未安裝資料區：依賴儲存的服務不接，回 not_implemented）；
 * 只設一個或不是絕對路徑 → RuntimeConfigError。
 */
export function runtimeConfigFromEnv(env: NodeJS.ProcessEnv): RuntimeConfig | null {
  const data = env[DATA_DIR_ENV];
  const fonts = env[FONTS_DIR_ENV];
  if (data === undefined && fonts === undefined) return null;
  return {
    dataDir: absoluteDir(data, DATA_DIR_ENV),
    fontsDir: absoluteDir(fonts, FONTS_DIR_ENV),
  };
}

export interface RuntimeDeps {
  /** 資料區鎖被占用時最多等多久（毫秒）；預設 0（不等） */
  readonly lockWaitMs?: number;
  /** 測試用：換掉啟動清掃 */
  readonly sweep?: typeof sweepStorage;
  /** 測試用：換掉字型載入 */
  readonly loadFonts?: (dir: string) => Promise<FontSet>;
}

/** 只有一般孤兒 PDF 刪不掉時照常啟動（裁定 #14）；其餘清掃失敗（含已清除素材的 PDF）照拋。 */
function runSweep(
  sweep: typeof sweepStorage,
  ...args: Parameters<typeof sweepStorage>
): { sweep: StorageSweep; orphanSweepFailed: boolean } {
  try {
    return { sweep: sweep(...args), orphanSweepFailed: false };
  } catch (error) {
    if (error instanceof OrphanPdfSweepError)
      return { sweep: error.sweep, orphanSweepFailed: true };
    throw error;
  }
}

/**
 * 取得資料區鎖 → 開資料庫（含 migration）→ 建檔案儲存區 → 跑一次 sweepStorage。
 * 鎖被另一個 helper 持有拋 DataDirInUseError（不碰資料庫）。任何一步失敗都關掉資料庫、放鎖再拋出。
 */
export function openHelperRuntime(config: RuntimeConfig, deps: RuntimeDeps = {}): HelperRuntime {
  const lock = tryAcquireDataDirLock(config.dataDir, { waitMs: deps.lockWaitMs ?? 0 });
  if (lock === null) throw new DataDirInUseError();
  let db: OpenedDatabase['db'];
  try {
    db = openDatabase(path.join(config.dataDir, DATABASE_FILE)).db;
  } catch (error) {
    lock.release();
    throw error;
  }
  try {
    const fileStore = createLocalFileStore(path.join(config.dataDir, FILES_DIR));
    // 啟動清掃帶寬限期（保留：鎖之前的版本與匯出流程仍可能留下剛寫入、尚未寫資料列的檔）
    const swept = runSweep(deps.sweep ?? sweepStorage, db, fileStore, { orphanGrace: true });
    const readFonts = deps.loadFonts ?? loadBundledFonts;
    let fonts: Promise<FontSet> | null = null;
    return {
      db,
      fileStore,
      repos: createRepositories(db),
      exports: createExportVersionRepository(db, fileStore),
      ...swept,
      loadFonts() {
        fonts ??= readFonts(config.fontsDir).catch((error: unknown) => {
          fonts = null;
          throw error;
        });
        return fonts;
      },
      close: () => {
        if (db.isOpen) db.close();
        lock.release();
      },
    };
  } catch (error) {
    db.close();
    lock.release();
    throw error;
  }
}
