import {
  BRIDGE_SCHEMAS,
  BridgeRequest,
  type BridgeErrorCode,
  type BridgeFailure,
  type BridgeOperation,
} from '@rolecraft/contracts';

import type { BridgeTransport } from './transport.ts';

/** 某操作的請求型別。 */
export type RequestOf<Op extends BridgeOperation> = Extract<BridgeRequest, { op: Op }>;

/** 某操作的回應型別（成功或 BridgeFailure），已經過 contracts schema 驗證。 */
export type ResponseOf<Op extends BridgeOperation> = ReturnType<
  (typeof BRIDGE_SCHEMAS)[Op]['response']['parse']
>;

export interface EditorBridge {
  /** 驗證請求 → 經 service worker 轉送 → 驗證回應。任何失敗都回 BridgeFailure，不丟例外。 */
  send<Op extends BridgeOperation>(request: RequestOf<Op>): Promise<ResponseOf<Op>>;
}

function failure(code: BridgeErrorCode, message: string): BridgeFailure {
  return { ok: false, error: { code, message } };
}

/**
 * 編輯器端的橋接客戶端。service worker 也會驗，但編輯器不信任收到的回覆，自己再驗一次。
 * transport 為 null（不在擴充功能頁內）時一律回失敗。
 */
export function createEditorBridge(transport: BridgeTransport | null): EditorBridge {
  async function send(raw: unknown): Promise<unknown> {
    const parsed = BridgeRequest.safeParse(raw);
    if (!parsed.success) return failure('invalid_request', '請求不符橋接 schema，未送出');
    if (!transport) {
      return failure('internal_error', '不在擴充功能頁內，無法連到本機輔助程式');
    }
    let reply: unknown;
    try {
      reply = await transport.send(parsed.data);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return failure('internal_error', `無法連到擴充功能背景程式：${reason}`);
    }
    const checked = BRIDGE_SCHEMAS[parsed.data.op].response.safeParse(reply);
    if (!checked.success) return failure('internal_error', '收到的回應不符橋接 schema，已丟棄');
    return checked.data;
  }

  return {
    send: send as EditorBridge['send'],
  };
}
