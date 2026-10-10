import { RELAY_CHANNEL } from '@rolecraft/contracts';

/**
 * 頁面（編輯器頁、content script）→ service worker 的轉送訊息。
 * 頁面不直接連 Native Messaging（ADR-0003），只能把橋接請求包成這個形狀交給 service worker。
 * 頁面不帶請求 id：chrome.runtime.sendMessage 本身就一問一答，id 由 service worker 配。
 * 通道名稱唯一定義在 contracts，與編輯器共用。
 */
export { RELAY_CHANNEL };

export interface RelayMessage {
  channel: typeof RELAY_CHANNEL;
  /** 未驗證的橋接請求；service worker 會用 contracts schema 驗。 */
  request: unknown;
}

/** 只認恰好兩個鍵 { channel, request } 的物件。 */
export function isRelayMessage(value: unknown): value is RelayMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes('request') &&
    (value as { channel?: unknown }).channel === RELAY_CHANNEL
  );
}

export function relayMessage(request: unknown): RelayMessage {
  return { channel: RELAY_CHANNEL, request };
}
