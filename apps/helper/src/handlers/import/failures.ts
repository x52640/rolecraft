import type { BridgeFailure } from '@rolecraft/contracts';

/** importId 不是 helper 配發的（或已清掉）。訊息是固定文字，不回填請求內容。 */
export function unknownImport(): BridgeFailure {
  return {
    ok: false,
    error: { code: 'invalid_request', message: '找不到這筆匯入，請重新選擇 PDF' },
  };
}
