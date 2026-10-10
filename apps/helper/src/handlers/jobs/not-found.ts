import type { BridgeFailure } from '@rolecraft/contracts';

/** 快照 ID 不是 helper 配發過的（bridge.md 共同規則）：回 invalid_request，訊息不回填請求內容。 */
export function snapshotNotFound(): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: '找不到這個職缺快照' } };
}
