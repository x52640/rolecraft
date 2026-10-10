// helper 執行入口：由瀏覽器經 host 包裝檔啟動（ADR-0003）。
// 只從 argv 讀呼叫者 origin、從環境變數讀允許清單（安裝程式寫入包裝檔）；
// 請求內容永遠不會成為路徑、參數或指令。
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createMacFolderPicker, createMacPdfPicker } from '@rolecraft/sources';
import {
  createApplicationRecordRepository,
  createExportVersionRepository,
  createRepositories,
} from '@rolecraft/storage';

import { EXIT_CODES, startHost } from './bridge/host.ts';
import { createLineLogger } from './bridge/logger.ts';
import { ALLOWED_ORIGINS_ENV, parseAllowedOrigins } from './bridge/origin.ts';
import { createApplicationsService } from './handlers/applications/storage-service.ts';
import { createClaimsService, type HelperStorage } from './handlers/claims/storage-service.ts';
import { createExportService } from './handlers/export/export-service.ts';
import { createResumeImportService, type PdfFilePicker } from './handlers/import/import-service.ts';
import { createJobsService } from './handlers/jobs/storage-service.ts';
import { createMessagesService } from './handlers/messages/assemble.ts';
import { createProvidersService } from './handlers/providers/providers-service.ts';
import { createResumeWithClaude, pauseInterruptedJobs } from './handlers/resume/assemble.ts';
import type { HelperServices } from './handlers/services.ts';
import { createSourcesService, type FolderPicker } from './handlers/sources/local-sources.ts';
import { openHelperRuntime, runtimeConfigFromEnv, type HelperRuntime } from './services/runtime.ts';

/** 完整 runtime（含字型、匯出版本庫）；只有 db／fileStore 的儲存不能接匯出。 */
function isRuntime(storage: HelperStorage): storage is HelperRuntime {
  return 'loadFonts' in storage;
}

/** 系統選取器（ADR-0003）：只回給 helper 的服務，路徑不進任何回應（R7）。 */
export interface NativePickers {
  readonly folder?: FolderPicker;
  readonly pdf?: PdfFilePicker;
}

/** macOS 原生選取器（實作在 @rolecraft/sources）；其他平台不接（D11），對應操作回「尚未支援」。 */
export function nativePickers(platform: NodeJS.Platform = process.platform): NativePickers {
  if (platform !== 'darwin') return {};
  return { folder: createMacFolderPicker(), pdf: createMacPdfPicker() };
}

/**
 * 服務組裝：各操作的服務由對應 Task 接上；沒接上的 handler 回「尚未支援」。
 * 沒有本機儲存（尚未設定資料區）時，依賴儲存的服務一律不接。
 * pickers 只供測試替換（不開真的對話框）。
 */
export function createServices(
  storage: HelperStorage | null = null,
  pickers: NativePickers = nativePickers(),
): HelperServices {
  const repositories = storage && createRepositories(storage.db);
  const { folder, pdf } = pickers;
  const providers = createProvidersService();
  return {
    providers,
    sources: createSourcesService(folder ? { picker: folder } : {}),
    ...(repositories && { jobs: createJobsService(repositories.jobSnapshots) }),
    ...(repositories &&
      pdf && {
        resumeImport: createResumeImportService({ picker: pdf, profiles: repositories.profiles }),
      }),
    ...(storage && {
      applications: createApplicationsService({
        applications: createApplicationRecordRepository(storage.db, storage.fileStore),
        exportVersions: createExportVersionRepository(storage.db, storage.fileStore),
      }),
    }),
    ...(storage && { claims: createClaimsService(storage) }),
    ...(storage && { resume: createResumeWithClaude(storage.db, providers) }),
    ...(storage && { messages: createMessagesService(storage.db, providers) }),
    ...(storage && isRuntime(storage) && { pdfExport: createExportService(storage) }),
  };
}

export function main(): void {
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
  let runtime: HelperRuntime | null;
  try {
    const config = runtimeConfigFromEnv(process.env);
    runtime = config && openHelperRuntime(config);
    if (runtime) pauseInterruptedJobs(runtime.db);
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
    services: createServices(runtime),
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
