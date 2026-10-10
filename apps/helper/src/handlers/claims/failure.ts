import type { BridgeFailure } from '@rolecraft/contracts';

import type { ClaimsWriteResult } from './service.ts';

const MESSAGES = {
  not_found: '找不到這個事實項或專案',
  rejected: '這個動作不適用於該事實項',
  stale: '事實項的複核狀態已改變，請重新讀取並對照原文後再確認',
} as const;

/** 事實項操作失敗：一律 invalid_request，訊息是固定文字，不回填請求內容。 */
export function claimsFailure(reason: keyof typeof MESSAGES): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: MESSAGES[reason] } };
}

/** 寫入結果 → 回應。 */
export function ackOrFailure(result: ClaimsWriteResult): { ok: true } | BridgeFailure {
  return result.ok ? { ok: true } : claimsFailure(result.reason);
}
