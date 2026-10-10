// helper 日誌：只寫 stderr（stdout 是協定通道），只收固定欄位。
// 刻意不提供自由文字欄位：請求內容、例外訊息、堆疊都可能含履歷或職缺全文，一律不記。
import type { BridgeOperation } from '@rolecraft/contracts';

import type { FrameErrorCode } from './framing.ts';

export type LogEvent =
  | { event: 'host_started' }
  | { event: 'host_stopped'; exitCode: number }
  | { event: 'origin_rejected'; originFormatValid: boolean }
  | { event: 'config_invalid' }
  | { event: 'protocol_error'; code: FrameErrorCode | 'too_many_pending' | 'write_failed' }
  | { event: 'stream_truncated' }
  | {
      event: 'request_rejected';
      reason: 'not_object' | 'unknown_op' | 'schema';
      op?: BridgeOperation;
    }
  | { event: 'request_handled'; op: BridgeOperation; ok: boolean; ms: number }
  | { event: 'handler_failed'; op: BridgeOperation; errorName: string }
  | { event: 'response_invalid'; op: BridgeOperation }
  | { event: 'response_too_large'; op: BridgeOperation | null; bytes: number };

export interface Logger {
  log(entry: LogEvent): void;
}

/** 例外類別名稱也可能被丟出者竄改；只接受短的英文識別字，其餘一律記為 Error。 */
export function safeErrorName(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ? name : 'Error';
}

/** 每行一筆 JSON，附時間。write 由呼叫端注入（正式為 process.stderr）。 */
export function createLineLogger(write: (line: string) => void): Logger {
  return {
    log(entry) {
      write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
    },
  };
}

export const silentLogger: Logger = { log() {} };
