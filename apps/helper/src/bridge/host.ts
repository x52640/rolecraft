// Native Messaging host 主迴圈（ADR-0003）：瀏覽器以 stdio 啟動，argv 第一個參數是呼叫者 origin。
// stdout 只寫框；日誌只寫 stderr（經 Logger）。
// 請求依抵達順序逐一處理、依序回覆：contracts 的信封沒有請求 ID，回覆順序就是對應關係。
// 任何框錯誤（超大、壞 JSON、截斷）都直接結束連線，不嘗試重新同步。
import { Buffer } from 'node:buffer';
import type { Readable, Writable } from 'node:stream';

import type { BridgeOperation } from '@rolecraft/contracts';

import { dispatch, failure } from './dispatch.ts';
import { FrameDecoder, FrameError, MAX_INCOMING_BYTES, encodeFrame } from './framing.ts';
import type { HelperServices } from '../handlers/services.ts';
import type { Logger } from './logger.ts';
import { isAllowedOrigin, isExtensionOrigin } from './origin.ts';

/** 尚未回覆的請求上限；超過視為濫用並斷線（每則都已在記憶體，避免無上限累積）。 */
export const MAX_PENDING_REQUESTS = 32;

export const EXIT_CODES = {
  ok: 0,
  config: 1,
  origin: 2,
  protocol: 3,
  truncated: 4,
} as const;

export interface HostOptions {
  input: Readable;
  output: Writable;
  /** 瀏覽器傳入的呼叫者 origin（process.argv[2]）。 */
  origin: string | undefined;
  allowedOrigins: readonly string[];
  services: HelperServices;
  logger: Logger;
  exit: (code: number) => void;
  maxIncomingBytes?: number;
  maxPending?: number;
}

export function startHost(options: HostOptions): void {
  const { input, output, origin, allowedOrigins, services, logger } = options;
  let exited = false;
  const exit = (code: number): void => {
    if (exited) return;
    exited = true;
    logger.log({ event: 'host_stopped', exitCode: code });
    options.exit(code);
  };

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    logger.log({ event: 'origin_rejected', originFormatValid: isExtensionOrigin(origin) });
    exit(EXIT_CODES.origin);
    return;
  }
  logger.log({ event: 'host_started' });

  const decoder = new FrameDecoder(options.maxIncomingBytes ?? MAX_INCOMING_BYTES);
  const maxPending = options.maxPending ?? MAX_PENDING_REQUESTS;
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;
  let closing = false;

  const write = (response: unknown, op: BridgeOperation | null): void => {
    let frame: Buffer;
    try {
      frame = encodeFrame(response);
    } catch (err) {
      const bytes = err instanceof FrameError ? Buffer.byteLength(JSON.stringify(response)) : 0;
      logger.log({ event: 'response_too_large', op, bytes });
      frame = encodeFrame(failure('internal_error', '回應超過 1 MB 上限（分塊尚未支援）'));
    }
    output.write(frame);
  };

  /** 停止接收；等已排隊的請求回覆完，再（選擇性）送一則失敗後結束。 */
  const shutdown = (code: number, finalReply?: unknown): void => {
    if (closing) return;
    closing = true;
    input.removeListener('data', onData);
    input.pause();
    queue = queue.then(() => {
      if (finalReply !== undefined) write(finalReply, null);
      exit(code);
    });
  };

  const enqueue = (message: unknown): void => {
    pending += 1;
    queue = queue
      .then(async () => {
        const { op, response } = await dispatch(message, services, logger);
        write(response, op);
      })
      .catch(() => {
        // dispatch 已攔下 handler 例外；走到這裡代表寫出失敗，結束連線最安全。
        logger.log({ event: 'protocol_error', code: 'write_failed' });
        shutdown(EXIT_CODES.protocol);
      })
      .finally(() => {
        pending -= 1;
      });
  };

  function onData(chunk: Buffer): void {
    if (closing) return;
    // 壞框之前已解出的請求照常排隊（結果與 chunk 切法無關），再處理框錯誤。
    const { messages, error } = decoder.decode(chunk);
    for (const message of messages) {
      if (pending >= maxPending) {
        logger.log({ event: 'protocol_error', code: 'too_many_pending' });
        shutdown(EXIT_CODES.protocol, failure('invalid_request', '未回覆請求過多，結束連線'));
        return;
      }
      enqueue(message);
    }
    if (error) {
      logger.log({ event: 'protocol_error', code: error.code });
      shutdown(EXIT_CODES.protocol, failure('invalid_request', '框格式錯誤，結束連線'));
    }
  }

  input.on('data', onData);
  input.on('end', () => {
    if (decoder.hasPartial) {
      logger.log({ event: 'stream_truncated' });
      shutdown(EXIT_CODES.truncated);
    } else {
      shutdown(EXIT_CODES.ok);
    }
  });
  // 瀏覽器關閉連線時 stdout 可能 EPIPE；不再寫，直接結束。
  output.on('error', () => {
    closing = true;
    exit(EXIT_CODES.ok);
  });
}
