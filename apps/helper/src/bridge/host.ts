// Native Messaging host 主迴圈（ADR-0003）：瀏覽器以 stdio 啟動，argv 第一個參數是呼叫者 origin。
// stdout 只寫框；日誌只寫 stderr（經 Logger）。
// 每則訊息是 contracts 的 BridgeRequestEnvelope（{ id, request }）；請求同時處理，完成就以同一 id 回覆，
// 回覆順序不代表對應關係。同一條連線上每個 id 只回一次：
// - id 缺漏或不合法 → 無法歸屬：等在途請求回完，送一則 id 為 null 的 invalid_request 後斷線
// - id 重複（本連線出現過）→ 不以該 id 再回覆：同上斷線（原請求仍照常回一次）
// 任何框錯誤（超大、壞 JSON、截斷）都直接結束連線，不嘗試重新同步。
import { Buffer } from 'node:buffer';
import type { Readable, Writable } from 'node:stream';

import { BRIDGE_MAX_IN_FLIGHT, type BridgeOperation } from '@rolecraft/contracts';

import { dispatch, failure } from './dispatch.ts';
import { envelope, readEnvelope } from './envelope.ts';
import { FrameDecoder, FrameError, MAX_INCOMING_BYTES, encodeFrame } from './framing.ts';
import type { HelperServices } from '../handlers/services.ts';
import type { Logger } from './logger.ts';
import { isAllowedOrigin, isExtensionOrigin } from './origin.ts';

/** 尚未回覆的請求上限；超過視為濫用並斷線（每則都已在記憶體，避免無上限累積）。 */
export const MAX_PENDING_REQUESTS = BRIDGE_MAX_IN_FLIGHT;

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
  const inFlight = new Set<Promise<void>>();
  /** 本連線出現過的所有 id（含已回覆的），用來擋重複。id 最長 64 字，量級可忽略。 */
  const seenIds = new Set<string>();
  let closing = false;

  const write = (id: string | null, response: unknown, op: BridgeOperation | null): void => {
    let frame: Buffer;
    try {
      frame = encodeFrame(envelope(id, response));
    } catch (err) {
      const bytes = err instanceof FrameError ? Buffer.byteLength(JSON.stringify(response)) : 0;
      logger.log({ event: 'response_too_large', op, bytes });
      frame = encodeFrame(
        envelope(id, failure('internal_error', '回應超過 1 MB 上限（分塊尚未支援）')),
      );
    }
    output.write(frame);
  };

  /** 停止接收；等在途請求回覆完，再（選擇性）送一則 id 為 null 的失敗後結束。 */
  const shutdown = (code: number, finalReply?: unknown): void => {
    if (closing) return;
    closing = true;
    input.removeListener('data', onData);
    input.pause();
    void Promise.allSettled([...inFlight]).then(() => {
      if (finalReply !== undefined) write(null, finalReply, null);
      exit(code);
    });
  };

  const handle = (id: string, request: unknown): void => {
    const task: Promise<void> = dispatch(request, services, logger)
      .then(({ op, response }) => {
        write(id, response, op);
      })
      .catch(() => {
        // dispatch 已攔下 handler 例外；走到這裡代表寫出失敗，結束連線最安全。
        logger.log({ event: 'protocol_error', code: 'write_failed' });
        shutdown(EXIT_CODES.protocol);
      })
      .finally(() => {
        inFlight.delete(task);
      });
    inFlight.add(task);
  };

  /** 處理一則已解碼的訊息；回傳 false 表示已開始斷線，後面的訊息不再處理。 */
  const accept = (message: unknown): boolean => {
    if (inFlight.size >= maxPending) {
      logger.log({ event: 'protocol_error', code: 'too_many_pending' });
      shutdown(EXIT_CODES.protocol, failure('invalid_request', '未回覆請求過多，結束連線'));
      return false;
    }
    const read = readEnvelope(message);
    if (read.kind === 'no_id') {
      logger.log({ event: 'protocol_error', code: 'invalid_id' });
      shutdown(EXIT_CODES.protocol, failure('invalid_request', '缺少合法的請求 id，結束連線'));
      return false;
    }
    if (seenIds.has(read.id)) {
      logger.log({ event: 'protocol_error', code: 'duplicate_id' });
      shutdown(EXIT_CODES.protocol, failure('invalid_request', '請求 id 重複，結束連線'));
      return false;
    }
    seenIds.add(read.id);
    if (read.kind === 'invalid') {
      logger.log({ event: 'envelope_rejected' });
      write(read.id, failure('invalid_request', '信封必須恰好是 { id, request }'), null);
      return true;
    }
    handle(read.id, read.request);
    return true;
  };

  function onData(chunk: Buffer): void {
    if (closing) return;
    // 壞框之前已解出的請求照常處理（結果與 chunk 切法無關），再處理框錯誤。
    const { messages, error } = decoder.decode(chunk);
    for (const message of messages) {
      if (!accept(message)) return;
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
