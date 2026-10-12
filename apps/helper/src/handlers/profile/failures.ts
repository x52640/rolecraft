import type { BridgeFailure, BridgeFailureReason } from '@rolecraft/contracts';

import type { ProfileUpdateRefusal } from './service.ts';

/**
 * 資料區已有多份 Profile（舊資料）：profile.get 不讀、import.confirm／profile.update 不寫（D28／Q8）。
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

/** profile.update 不寫入的固定訊息（D30）；不回填請求內容。 */
const UPDATE_MESSAGES: Record<ProfileUpdateRefusal, string> = {
  profile_conflict: '個人資料已在別處更新，這次修改沒有存',
  profile_missing: '還沒有已確認的個人資料，請先匯入或手動輸入',
  multiple_profiles: '資料區有多份個人資料，無法判斷要用哪一份',
  bad_source_row: '欄位對應不正確，這次修改沒有存',
  empty_profile: '內容全空，沒有可寫入的個人資料',
};

/** 有固定原因的（呼叫端據此處理）；其他只有固定訊息。 */
const UPDATE_REASONS: Partial<Record<ProfileUpdateRefusal, BridgeFailureReason>> = {
  profile_conflict: 'profile_conflict',
  profile_missing: 'profile_missing',
  multiple_profiles: 'multiple_profiles',
};

export function profileUpdateRefused(refusal: ProfileUpdateRefusal): BridgeFailure {
  const reason = UPDATE_REASONS[refusal];
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message: UPDATE_MESSAGES[refusal],
      ...(reason === undefined ? {} : { reason }),
    },
  };
}
