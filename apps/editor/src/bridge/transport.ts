import { RELAY_CHANNEL } from '@rolecraft/contracts';

/**
 * 編輯器頁 → service worker 的轉送通道（ADR-0003）。
 * 編輯器不直接連 Native Messaging，只能把橋接請求包成 { channel, request } 交給 service worker；
 * service worker 再驗 schema 與發送者、配請求 id 後才送給本機輔助程式。
 * 通道名稱唯一定義在 contracts，與擴充功能共用。
 */
export { RELAY_CHANNEL };

/** 送出一則已驗證的橋接請求，回傳 service worker 的原始回覆（尚未驗證）。 */
export interface BridgeTransport {
  send(request: unknown): Promise<unknown>;
}

/** chrome.runtime 中用到的部分。 */
interface RuntimeLike {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}

function currentRuntime(): RuntimeLike | undefined {
  const chromeGlobal = (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome;
  const runtime = chromeGlobal?.runtime;
  // 一般網頁也可能有 chrome.runtime 物件，但沒有 id；只有擴充功能頁才有。
  return runtime?.id && typeof runtime.sendMessage === 'function' ? runtime : undefined;
}

/** 擴充功能頁的轉送通道；不在擴充功能頁內（例如單獨開 HTML）時回 null。 */
export function createRuntimeTransport(runtime = currentRuntime()): BridgeTransport | null {
  if (!runtime) return null;
  return {
    send: (request) => runtime.sendMessage({ channel: RELAY_CHANNEL, request }),
  };
}
