// helper 啟動時的共用資源（P1-T040）：本機資料庫、檔案儲存區、隨附字型位置。
// 位置只從環境變數讀（安裝程式寫進 host 包裝檔，與允許清單同一處），請求內容永遠不會變成路徑（R7）。
// 開啟時呼叫一次 sweepStorage（D19 補救清掃；P1-T007 留下的接線）。
import path from 'node:path';

import { loadBundledFonts, type FontSet } from '@rolecraft/pdf-export';
import {
  createExportVersionRepository,
  createLocalFileStore,
  createRepositories,
  openDatabase,
  sweepStorage,
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
  /** 讀隨附字型（第一次讀後快取；失敗不快取，下次重讀） */
  loadFonts(): Promise<FontSet>;
  close(): void;
}

export class RuntimeConfigError extends Error {
  override readonly name = 'RuntimeConfigError';
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
  /** 測試用：換掉啟動清掃 */
  readonly sweep?: typeof sweepStorage;
  /** 測試用：換掉字型載入 */
  readonly loadFonts?: (dir: string) => Promise<FontSet>;
}

/** 開資料庫（含 migration）、建檔案儲存區、跑一次 sweepStorage。任何一步失敗都關掉資料庫再拋出。 */
export function openHelperRuntime(config: RuntimeConfig, deps: RuntimeDeps = {}): HelperRuntime {
  const { db } = openDatabase(path.join(config.dataDir, DATABASE_FILE));
  try {
    const fileStore = createLocalFileStore(path.join(config.dataDir, FILES_DIR));
    // 啟動清掃帶寬限期：其他 helper 行程可能剛寫入 PDF、還沒寫資料列（ADR-0003 每次連線一個行程）
    const sweep = (deps.sweep ?? sweepStorage)(db, fileStore, { orphanGrace: true });
    const readFonts = deps.loadFonts ?? loadBundledFonts;
    let fonts: Promise<FontSet> | null = null;
    return {
      db,
      fileStore,
      repos: createRepositories(db),
      exports: createExportVersionRepository(db, fileStore),
      sweep,
      loadFonts() {
        fonts ??= readFonts(config.fontsDir).catch((error: unknown) => {
          fonts = null;
          throw error;
        });
        return fonts;
      },
      close: () => {
        if (db.isOpen) db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
