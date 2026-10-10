import {
  BRIDGE_SCHEMAS,
  BridgeRequest,
  type BridgeErrorCode,
  type BridgeFailure,
  type OpenEditorResponse,
  type RequestDraftResponse,
  type SubmitJobCaptureResponse,
  type SubmitMessageCaptureResponse,
} from '@rolecraft/contracts';

import { DEFAULT_TIMEOUT_MS } from './host.ts';

/** 任一操作的回應（成功或 BridgeFailure），一律已經過 contracts schema 驗證。 */
export type BridgeResponse =
  | SubmitJobCaptureResponse
  | SubmitMessageCaptureResponse
  | RequestDraftResponse
  | OpenEditorResponse;

/** chrome.runtime.Port 中本客戶端用到的部分（測試可用假物件）。 */
export interface NativePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(cb: (message: unknown) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

export interface BridgeClientDeps {
  /** 開一條 Native Messaging 連線（正式環境為 chrome.runtime.connectNative）。 */
  connect(): NativePort;
  /** 斷線原因（正式環境為 chrome.runtime.lastError?.message）。 */
  lastError(): string | undefined;
  timeoutMs?: number;
}

export interface BridgeClient {
  /** 驗證請求 → 送給 helper → 驗證回應。任何失敗都回 BridgeFailure，不丟例外。 */
  send(request: unknown): Promise<BridgeResponse>;
  /** 主動斷線（下次 send 會重連）。 */
  close(): void;
}

export function bridgeFailure(code: BridgeErrorCode, message: string): BridgeFailure {
  return { ok: false, error: { code, message } };
}

/**
 * 橋接客戶端：只由 service worker 持有一條連線（ADR-0003）。
 * 橋接 schema 沒有請求 id，所以同一時間只送一則、依序等回覆；回覆逾時、多出未預期的訊息、
 * 或回應不符 schema 時斷線重來，避免後續請求對錯回覆。
 */
export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let port: NativePort | null = null;
  let waiter: { resolve(m: unknown): void; reject(e: Error): void } | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function drop(): void {
    const current = port;
    port = null;
    try {
      current?.disconnect();
    } catch {
      // 已斷線
    }
  }

  function ensurePort(): NativePort {
    if (port) return port;
    const created = deps.connect();
    created.onMessage.addListener((message) => {
      if (port !== created) return;
      const w = waiter;
      waiter = null;
      if (w) w.resolve(message);
      else drop(); // 沒人在等的訊息：順序已亂，斷線
    });
    created.onDisconnect.addListener(() => {
      if (port !== created) return;
      port = null;
      const w = waiter;
      waiter = null;
      w?.reject(new Error(deps.lastError() ?? '連線中斷'));
    });
    port = created;
    return created;
  }

  function exchange(message: BridgeRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter = null;
        drop();
        reject(new Error(`等待回覆逾時（${timeoutMs} ms）`));
      }, timeoutMs);
      waiter = {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      try {
        ensurePort().postMessage(message);
      } catch (err) {
        waiter = null;
        clearTimeout(timer);
        drop();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async function roundTrip(request: BridgeRequest): Promise<BridgeResponse> {
    let reply: unknown;
    try {
      reply = await exchange(request);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return bridgeFailure('internal_error', `無法連到本機輔助程式：${reason}`);
    }
    const parsed = BRIDGE_SCHEMAS[request.op].response.safeParse(reply);
    if (!parsed.success) {
      drop();
      return bridgeFailure('internal_error', '本機輔助程式的回應不符橋接 schema，已丟棄');
    }
    return parsed.data;
  }

  return {
    send(raw) {
      const parsed = BridgeRequest.safeParse(raw);
      if (!parsed.success) {
        return Promise.resolve(bridgeFailure('invalid_request', '請求不符橋接 schema，未送出'));
      }
      const run = queue.then(() => roundTrip(parsed.data));
      queue = run.catch(() => undefined);
      return run;
    },
    close() {
      drop();
    },
  };
}
