// sources.* 的失敗回應：固定文字，不回填請求內容或路徑（bridge.md 錯誤碼）。
import type { BridgeFailure } from '@rolecraft/contracts';

export function unknownRoot(): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: '找不到這個資料夾' } };
}

export function invalidEntry(): BridgeFailure {
  return {
    ok: false,
    error: { code: 'invalid_request', message: '項目不在這個資料夾最近一次的預覽中，請重新預覽' },
  };
}

export function pickerBusy(): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: '資料夾選取器已開啟' } };
}

export function folderUnreadable(): BridgeFailure {
  return {
    ok: false,
    error: { code: 'internal_error', message: '資料夾已無法讀取，請移除後重新選取' },
  };
}
