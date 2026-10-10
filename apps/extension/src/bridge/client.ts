import {
  BRIDGE_MAX_IN_FLIGHT,
  BRIDGE_SCHEMAS,
  BridgeRequest,
  BridgeResponseEnvelope,
  type BridgeErrorCode,
  type BridgeFailure,
  type BridgeRequestEnvelope,
  type BridgeResponse,
} from '@rolecraft/contracts';

import { DEFAULT_TIMEOUT_MS } from './host.ts';

export type { BridgeResponse };

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
  /** 單一請求從 send 到收到回覆的上限（含排隊等名額的時間）。 */
  timeoutMs?: number;
  /** helper 尚未回覆的請求上限（預設 contracts 的 BRIDGE_MAX_IN_FLIGHT）。 */
  maxInFlight?: number;
}

export interface BridgeClient {
  /** 驗證請求 → 送給 helper → 驗證回應。任何失敗都回 BridgeFailure，不丟例外。 */
  send(request: unknown): Promise<BridgeResponse>;
  /** 主動斷線：在途請求回 helper_unavailable；下次 send 會重連。 */
  close(): void;
}

export function bridgeFailure(code: BridgeErrorCode, message: string): BridgeFailure {
  return { ok: false, error: { code, message } };
}

/** 一次 send 的狀態。id 在真正送出時才配。 */
interface Call {
  request: BridgeRequest;
  resolve(response: BridgeResponse): void;
  timer: ReturnType<typeof setTimeout> | undefined;
  done: boolean;
}

/**
 * 橋接客戶端：只由 service worker 持有一條連線（ADR-0003）。
 * 每則請求配一個本客戶端內不重複的 id，包成 { id, request } 送出，回覆依 id 對應，可同時多則在途。
 * - 在途（含已逾時但 helper 還沒回的）達上限時，新請求排隊等名額，不讓 helper 因超量斷線。
 * - 逾時：該請求回 timeout，id 記為「已放棄」，晚到的回覆直接丟棄；不影響其他請求。
 *   若所有名額都被已放棄的請求占住（helper 疑似卡死），斷線重來。
 * - 回應不符該操作 schema：該請求回 internal_error，其他請求不受影響（id 對應不會錯）。
 * - 收到未知 id、id 為 null 或信封不合法：協定已不可信，斷線，在途請求全部回 internal_error。
 * - host 斷線或送不出去：在途請求回 helper_unavailable。
 */
export function createBridgeClient(deps: BridgeClientDeps): BridgeClient {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxInFlight = deps.maxInFlight ?? BRIDGE_MAX_IN_FLIGHT;
  let port: NativePort | null = null;
  let counter = 0;
  const pending = new Map<string, Call>();
  const abandoned = new Set<string>();
  const waiting: Call[] = [];

  function finish(call: Call, response: BridgeResponse): void {
    if (call.done) return;
    call.done = true;
    clearTimeout(call.timer);
    call.resolve(response);
  }

  /** 丟掉目前連線；在途請求全部以指定代碼失敗，排隊中的改用新連線送。 */
  function dropPort(code: BridgeErrorCode, message: string): void {
    const current = port;
    port = null;
    try {
      current?.disconnect();
    } catch {
      // 已斷線
    }
    const calls = [...pending.values()];
    pending.clear();
    abandoned.clear();
    for (const call of calls) finish(call, bridgeFailure(code, message));
    pump();
  }

  function onMessage(from: NativePort, message: unknown): void {
    if (port !== from) return; // 舊連線晚到的訊息
    const parsed = BridgeResponseEnvelope.safeParse(message);
    if (!parsed.success || parsed.data.id === null) {
      dropPort('internal_error', '本機輔助程式回報協定錯誤或回覆格式不符，已斷線');
      return;
    }
    const { id, response } = parsed.data;
    if (abandoned.delete(id)) {
      pump(); // 已逾時請求的晚到回覆：丟棄，釋放名額
      return;
    }
    const call = pending.get(id);
    if (!call) {
      dropPort('internal_error', '本機輔助程式回覆了未知的請求 id，已斷線');
      return;
    }
    pending.delete(id);
    const checked = BRIDGE_SCHEMAS[call.request.op].response.safeParse(response);
    finish(
      call,
      checked.success
        ? checked.data
        : bridgeFailure('internal_error', '本機輔助程式的回應不符橋接 schema，已丟棄'),
    );
    pump();
  }

  function ensurePort(): NativePort {
    if (port) return port;
    const created = deps.connect();
    port = created;
    created.onMessage.addListener((message) => onMessage(created, message));
    created.onDisconnect.addListener(() => {
      if (port !== created) return;
      dropPort('helper_unavailable', `無法連到本機輔助程式：${deps.lastError() ?? '連線中斷'}`);
    });
    return created;
  }

  function transmit(call: Call): void {
    counter += 1;
    const id = `r${counter}`;
    const envelope: BridgeRequestEnvelope = { id, request: call.request };
    let target: NativePort;
    try {
      target = ensurePort();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      finish(call, bridgeFailure('helper_unavailable', `無法連到本機輔助程式：${reason}`));
      return;
    }
    pending.set(id, call);
    try {
      target.postMessage(envelope);
    } catch (err) {
      pending.delete(id);
      const reason = err instanceof Error ? err.message : String(err);
      finish(call, bridgeFailure('helper_unavailable', `無法送出到本機輔助程式：${reason}`));
      dropPort('helper_unavailable', `本機輔助程式連線失效：${reason}`);
    }
  }

  function pump(): void {
    while (waiting.length > 0 && pending.size + abandoned.size < maxInFlight) {
      const call = waiting.shift();
      if (call && !call.done) transmit(call);
    }
  }

  function onTimeout(call: Call): void {
    const queued = waiting.indexOf(call);
    if (queued !== -1) waiting.splice(queued, 1);
    for (const [id, c] of pending) {
      if (c !== call) continue;
      pending.delete(id);
      abandoned.add(id);
    }
    finish(call, bridgeFailure('timeout', `等待本機輔助程式回覆逾時（${timeoutMs} ms）`));
    if (abandoned.size >= maxInFlight) {
      dropPort('helper_unavailable', '本機輔助程式長時間沒有回應，已斷線重來');
    }
  }

  return {
    send(raw) {
      const parsed = BridgeRequest.safeParse(raw);
      if (!parsed.success) {
        return Promise.resolve(bridgeFailure('invalid_request', '請求不符橋接 schema，未送出'));
      }
      return new Promise<BridgeResponse>((resolve) => {
        const call: Call = { request: parsed.data, resolve, timer: undefined, done: false };
        call.timer = setTimeout(() => onTimeout(call), timeoutMs);
        waiting.push(call);
        pump();
      });
    },
    close() {
      dropPort('helper_unavailable', '已主動關閉與本機輔助程式的連線');
    },
  };
}
