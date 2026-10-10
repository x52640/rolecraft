// helper 執行入口：由瀏覽器經 host 包裝檔啟動（ADR-0003）。
// 只從 argv 讀呼叫者 origin、從環境變數讀允許清單（安裝程式寫入包裝檔）；
// 請求內容永遠不會成為路徑、參數或指令。
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { EXIT_CODES, startHost } from './bridge/host.ts';
import { createLineLogger } from './bridge/logger.ts';
import { ALLOWED_ORIGINS_ENV, parseAllowedOrigins } from './bridge/origin.ts';
import { createProvidersService } from './handlers/providers/providers-service.ts';
import type { HelperServices } from './handlers/services.ts';

/** 服務組裝：各操作的服務由對應 Task 接上；未接上的服務 handler 回「尚未支援」。 */
export function createServices(): HelperServices {
  return {
    providers: createProvidersService(),
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
  startHost({
    input: process.stdin,
    output: process.stdout,
    origin: process.argv[2],
    allowedOrigins,
    services: createServices(),
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
