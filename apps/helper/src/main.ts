// helper 執行入口：由瀏覽器經 host 包裝檔啟動（ADR-0003）。
// 只從 argv 讀呼叫者 origin、從環境變數讀允許清單（安裝程式寫入包裝檔）；
// 請求內容永遠不會成為路徑、參數或指令。
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createPhotoProcessor, type PhotoProcessor } from '@rolecraft/pdf-export';
import {
  createMacFolderPicker,
  createMacPdfPicker,
  createMacPhotoPicker,
} from '@rolecraft/sources';
import {
  createApplicationRecordRepository,
  createExportVersionRepository,
  createRepositories,
} from '@rolecraft/storage';

import { EXIT_CODES, startHost } from './bridge/host.ts';
import { createLineLogger } from './bridge/logger.ts';
import { ALLOWED_ORIGINS_ENV, parseAllowedOrigins } from './bridge/origin.ts';
import { createAnalysisWithClaude } from './handlers/analysis/assemble.ts';
import { createApplicationsService } from './handlers/applications/storage-service.ts';
import { createClaimsService, type HelperStorage } from './handlers/claims/storage-service.ts';
import { createExportService } from './handlers/export/export-service.ts';
import { createResumeImportWithClaude } from './handlers/import/assemble.ts';
import type { PdfFilePicker } from './handlers/import/import-service.ts';
import { createIntroWithClaude } from './handlers/intro/assemble.ts';
import { createJobsService } from './handlers/jobs/storage-service.ts';
import { createMessagesService } from './handlers/messages/assemble.ts';
import { createPhotoService, type PhotoFilePicker } from './handlers/photo/photo-service.ts';
import { createProfileService } from './handlers/profile/profile-service.ts';
import { persistedProvidersOptions } from './handlers/providers/persistence.ts';
import {
  createProvidersService,
  type ProvidersServiceOptions,
} from './handlers/providers/providers-service.ts';
import { createResumeWithClaude, pauseInterruptedJobs } from './handlers/resume/assemble.ts';
import type { HelperServices } from './handlers/services.ts';
import { assembleSources } from './handlers/sources/assemble.ts';
import type { FolderPicker } from './handlers/sources/local-sources.ts';
import { connectDataDir } from './services/data-dir.ts';
import { writeNotice } from './services/notice.ts';
import { runtimeConfigFromEnv, type HelperRuntime } from './services/runtime.ts';

/** 完整 runtime（含字型、匯出版本庫）；只有 db／fileStore 的儲存不能接匯出。 */
function isRuntime(storage: HelperStorage): storage is HelperRuntime {
  return 'loadFonts' in storage;
}

/** 系統選取器（ADR-0003）：只回給 helper 的服務，路徑不進任何回應（R7）。 */
export interface NativePickers {
  readonly folder?: FolderPicker;
  readonly pdf?: PdfFilePicker;
  /** 照片（D28）：只限 JPEG／PNG、10 MB 以下 */
  readonly photo?: PhotoFilePicker;
}

/** macOS 原生選取器（實作在 @rolecraft/sources）；其他平台不接（D11），對應操作回「尚未支援」。 */
export function nativePickers(platform: NodeJS.Platform = process.platform): NativePickers {
  if (platform !== 'darwin') return {};
  return {
    folder: createMacFolderPicker(),
    pdf: createMacPdfPicker(),
    photo: createMacPhotoPicker(),
  };
}

/**
 * 服務組裝：各操作的服務由對應 Task 接上；沒接上的 handler 回「尚未支援」。
 * 沒有本機儲存（尚未設定資料區）時，依賴儲存的服務一律不接。
 * pickers 只供測試替換（不開真的對話框）；providerOptions 只供測試替換 Claude 檢查（假 probe／runDeps，
 * 不執行真實 CLI，P1-T070）；photoProcessor 只供測試替換照片重繪（不開 Chrome）。正式入口不傳。
 */
export function createServices(
  storage: HelperStorage | null = null,
  pickers: NativePickers = nativePickers(),
  base: HelperServices = {},
  providerOptions: Partial<ProvidersServiceOptions> = {},
  photoProcessor: PhotoProcessor = createPhotoProcessor(),
): HelperServices {
  const repositories = storage && createRepositories(storage.db);
  const { folder, pdf } = pickers;
  // base：資料區被占用期間已在用的服務；接手後沿用，選定的模型與資料夾不會消失（裁定 #13）
  // 有資料區時選定模型、授權資料夾、已驗證版本存進資料區（P1-T058）
  const providers =
    base.providers ??
    createProvidersService({
      ...(storage ? persistedProvidersOptions(storage.db) : {}),
      ...providerOptions,
    });
  const sources = assembleSources(base.sources, folder, storage?.db);
  return {
    providers,
    sources,
    ...(repositories && { jobs: createJobsService(repositories.jobSnapshots) }),
    // 履歷匯入＋AI 整理（P1-T069）：選定的 Claude 模型、R6 紀錄存進資料區。
    // D28：網頁擷取、手動輸入、profile.get 有資料區就可用；PDF 選取器只決定有沒有 import.pick_pdf
    ...(storage && { resumeImport: createResumeImportWithClaude(storage.db, pdf, providers) }),
    ...(repositories && { profile: createProfileService(repositories.profiles) }),
    // 照片（D28，P1-T083）：有資料區就有 get／remove；選取器只決定有沒有 photo.pick
    ...(storage && {
      photo: createPhotoService({
        db: storage.db,
        fileStore: storage.fileStore,
        processor: photoProcessor,
        ...(pickers.photo && { picker: pickers.photo }),
      }),
    }),
    ...(storage && {
      applications: createApplicationsService({
        applications: createApplicationRecordRepository(storage.db, storage.fileStore),
        exportVersions: createExportVersionRepository(storage.db, storage.fileStore),
      }),
    }),
    ...(storage && { claims: createClaimsService(storage) }),
    ...(storage && { resume: createResumeWithClaude(storage.db, providers, sources) }),
    ...(storage && { messages: createMessagesService(storage.db, providers, sources) }),
    ...(storage && { analysis: createAnalysisWithClaude(storage.db, providers, sources) }),
    ...(storage && { intro: createIntroWithClaude(storage.db, providers, sources) }),
    ...(storage && isRuntime(storage) && { pdfExport: createExportService(storage) }),
  };
}

/** main 的注入點：只給開發用 harness（scripts/dev/harness-helper.mjs）以程式呼叫時使用。 */
export interface MainOptions {
  /** 預設 nativePickers()。正式入口直接執行本檔時一律用預設；沒有環境變數或參數能改它。 */
  readonly pickers?: () => NativePickers;
}

export function main(options: MainOptions = {}): void {
  const pickers = options.pickers ?? nativePickers;
  const logger = createLineLogger((line) => process.stderr.write(line));
  let allowedOrigins: readonly string[];
  try {
    allowedOrigins = parseAllowedOrigins(process.env[ALLOWED_ORIGINS_ENV]);
  } catch {
    logger.log({ event: 'config_invalid' });
    process.exitCode = EXIT_CODES.config;
    return;
  }
  // 資料區設定錯、資料庫打不開或啟動清掃（sweepStorage）失敗：不帶著未清掃的資料區上線。
  // 資料區被另一個 helper 占用：不退出、不開儲存（connectDataDir，裁定 #13）。
  let services: HelperServices;
  try {
    const config = runtimeConfigFromEnv(process.env);
    services = config
      ? connectDataDir(config, {
          assemble: (runtime: HelperRuntime, base?: HelperServices) => {
            pauseInterruptedJobs(runtime.db);
            return createServices(runtime, pickers(), base);
          },
          withoutStorage: () => createServices(null, pickers()),
          notice: (event) => writeNotice((line) => process.stderr.write(line), event),
        })
      : createServices(null, pickers());
  } catch {
    logger.log({ event: 'config_invalid' });
    process.exitCode = EXIT_CODES.config;
    return;
  }
  startHost({
    input: process.stdin,
    output: process.stdout,
    origin: process.argv[2],
    allowedOrigins,
    services,
    logger,
    // 用 exitCode 而非 process.exit，讓 stdout 緩衝寫完再結束。
    exit: (code) => {
      process.exitCode = code;
      process.stdin.destroy();
    },
  });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) main();
