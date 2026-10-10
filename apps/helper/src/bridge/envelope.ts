// Native Messaging 信封（contracts BridgeRequestEnvelope）：helper 先取出請求 id，才知道回覆該掛在哪個 id 上。
// 分三種結果：
// - request：id 合法、形狀正確 → 交給 dispatch 驗內層請求
// - invalid：id 合法但信封多帶／缺欄位 → 以該 id 回 invalid_request
// - no_id：不是物件、沒有 id、id 不合法 → 無法歸屬，回 id 為 null 的失敗並斷線
import { BridgeRequestId, type BridgeResponseEnvelope } from '@rolecraft/contracts';

export type EnvelopeRead =
  | { kind: 'request'; id: string; request: unknown }
  | { kind: 'invalid'; id: string }
  | { kind: 'no_id' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readEnvelope(message: unknown): EnvelopeRead {
  // Object.hasOwn：id 不能來自原型鏈（例如 JSON 的 "__proto__" 鍵）。
  if (!isPlainObject(message) || !Object.hasOwn(message, 'id')) return { kind: 'no_id' };
  const id = BridgeRequestId.safeParse(message.id);
  if (!id.success) return { kind: 'no_id' };
  const keys = Object.keys(message);
  if (keys.length !== 2 || !Object.hasOwn(message, 'request')) {
    return { kind: 'invalid', id: id.data };
  }
  return { kind: 'request', id: id.data, request: message.request };
}

export function envelope(id: string | null, response: unknown): BridgeResponseEnvelope {
  return { id, response: response as BridgeResponseEnvelope['response'] };
}
