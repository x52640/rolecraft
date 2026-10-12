import type { BridgeFailure } from '@rolecraft/contracts';

/**
 * 資料區已有多份 Profile（舊資料）：profile.get 不讀、import.confirm 不寫（D28／Q8）。
 * 訊息是固定文字；呼叫端看固定原因 multiple_profiles 判斷，不比對文字。
 */
export function multipleProfiles(): BridgeFailure {
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message: '資料區有多份個人資料，無法判斷要用哪一份',
      reason: 'multiple_profiles',
    },
  };
}
