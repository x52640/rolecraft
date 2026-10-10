// 操作分派（R7）：只接受 contracts 的 BridgeOperation，逐一用該操作的 schema 驗證後才交給 handler。
// 任何欄位都只當資料傳給 handler；本檔不碰檔案、子程序或 shell。
import {
  BRIDGE_SCHEMAS,
  BridgeOperation,
  BridgeRequest,
  type BridgeFailure,
} from '@rolecraft/contracts';

import { HANDLERS } from '../handlers/registry.ts';
import type { HelperServices } from '../handlers/services.ts';
import { safeErrorName, type Logger } from './logger.ts';

/** 分派結果：要回給瀏覽器的回應，以及（若可辨識）它屬於哪個操作。 */
export interface DispatchResult {
  op: BridgeOperation | null;
  response: unknown;
}

export function failure(code: BridgeFailure['error']['code'], message: string): BridgeFailure {
  return { ok: false, error: { code, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 依 op 查分派表。payload 已由 BridgeRequest 依 op 驗證，所以和該 handler 的參數型別一致。 */
function runHandler(request: BridgeRequest, services: HelperServices): Promise<unknown> {
  const handler = HANDLERS[request.op] as (
    payload: BridgeRequest['payload'],
    services: HelperServices,
  ) => Promise<unknown>;
  return handler(request.payload, services);
}

/**
 * 驗證並分派一則已解碼的訊息。永遠回傳一個合乎該操作 response schema 的回應：
 * 不合法請求回 invalid_request；handler 例外或回應不合 schema 回 internal_error。
 * 錯誤訊息是固定文字，不回填請求內容或例外訊息（可能含履歷全文）。
 */
export async function dispatch(
  message: unknown,
  services: HelperServices,
  logger: Logger,
): Promise<DispatchResult> {
  if (!isPlainObject(message)) {
    logger.log({ event: 'request_rejected', reason: 'not_object' });
    return { op: null, response: failure('invalid_request', '請求必須是 JSON 物件') };
  }
  // Object.hasOwn：避免 op 落到原型鏈上的鍵（例如 toString、__proto__）。
  const rawOp = Object.hasOwn(message, 'op') ? message.op : undefined;
  const opResult = BridgeOperation.safeParse(rawOp);
  if (!opResult.success) {
    logger.log({ event: 'request_rejected', reason: 'unknown_op' });
    return { op: null, response: failure('invalid_request', '操作不在清單內') };
  }
  const op = opResult.data;
  const parsed = BridgeRequest.safeParse(message);
  if (!parsed.success) {
    logger.log({ event: 'request_rejected', reason: 'schema', op });
    return { op, response: failure('invalid_request', '請求不符該操作的 schema') };
  }

  const started = Date.now();
  let response: unknown;
  try {
    response = await runHandler(parsed.data, services);
  } catch (err) {
    logger.log({ event: 'handler_failed', op, errorName: safeErrorName(err) });
    return { op, response: failure('internal_error', '處理請求時發生內部錯誤') };
  }
  const checked = BRIDGE_SCHEMAS[op].response.safeParse(response);
  if (!checked.success) {
    logger.log({ event: 'response_invalid', op });
    return { op, response: failure('internal_error', '內部回應不符 schema') };
  }
  logger.log({ event: 'request_handled', op, ok: checked.data.ok, ms: Date.now() - started });
  return { op, response: checked.data };
}
