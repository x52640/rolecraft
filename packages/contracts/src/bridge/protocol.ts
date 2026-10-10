import { z } from 'zod';

import { BridgeRequest } from './envelope.ts';

/**
 * 橋接共用常數與 Native Messaging 信封（ADR-0003、bridge.md）。
 * helper、extension、editor 都從這裡取，不各寫一份。
 */

/** Native Messaging host 名稱；host manifest 必須用同一個名稱註冊。 */
export const NATIVE_HOST_NAME = 'com.rolecraft.helper';

/** 頁面（編輯器頁、content script）→ service worker 的轉送通道名稱。 */
export const RELAY_CHANNEL = 'rolecraft.bridge';

/** 同一條 Native Messaging 連線上、helper 尚未回覆的請求上限；客戶端不得超過。 */
export const BRIDGE_MAX_IN_FLIGHT = 32;

/**
 * 請求 id：呼叫端產生的不透明字串，只用來對應回覆，helper 不解讀。
 * 限 1–64 個英數、底線、連字號，避免被當成路徑或其他有意義的值。
 */
export const BridgeRequestId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export type BridgeRequestId = z.infer<typeof BridgeRequestId>;

/** service worker → helper 的一則訊息。頁面送的是 BridgeRequest，不帶 id。 */
export const BridgeRequestEnvelope = z.strictObject({
  id: BridgeRequestId,
  request: BridgeRequest,
});
export type BridgeRequestEnvelope = z.infer<typeof BridgeRequestEnvelope>;

/**
 * helper → service worker 的一則訊息。response 的細節由客戶端依該 id 的操作用
 * BRIDGE_SCHEMAS[op].response 驗證。id 為 null 表示 helper 無法歸屬到任何請求的協定錯誤
 * （id 不合法或重複），helper 送出後會結束連線。
 * 之後要分塊時，以同一 id 加新的訊息形狀（additive），不改這裡的對應方式。
 */
export const BridgeResponseEnvelope = z.strictObject({
  id: BridgeRequestId.nullable(),
  response: z.looseObject({ ok: z.boolean() }),
});
export type BridgeResponseEnvelope = z.infer<typeof BridgeResponseEnvelope>;
