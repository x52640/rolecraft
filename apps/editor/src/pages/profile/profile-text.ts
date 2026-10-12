import type { BridgeFailure } from '@rolecraft/contracts';

import { helperUnavailableText } from '../../bridge/helper-busy.ts';

/** 個人資料頁的固定文字（resume-import「個人資料編輯（D30）」）。 */
export const PROFILE_PAGE_TEXT = {
  /** 儲存成功後的固定提示（D30） */
  saved: '已儲存。已產生的客製履歷與自介不會跟著改；需要的話到履歷頁重新產生。',
  /** 儲存前一直顯示的提示 */
  beforeSave:
    '修改不會回溯已產生的客製履歷、自介或已匯出、已投遞的版本；要反映修改，需到履歷頁重新產生。',
  /** 改公司、職稱、開始或刪整段經歷時，儲存前另外提示（D30） */
  unmatched: '既有客製履歷中這段經歷的段落會對不到、不能匯出，需重新產生。',
  /** 刪經歷不套 D19、不刪任何 PDF（D30 (b)） */
  removeKeepsPdf: '刪除經歷只改個人資料，不會刪除任何已匯出的履歷版本或 PDF。',
  /** 衝突（D30 (c)）：未存修改直接捨棄 */
  conflict: '個人資料已在別處更新，這次修改沒有存。已重新讀取最新內容，你剛才的修改沒有保留。',
  multiple:
    '資料區有多份個人資料（舊資料），無法判斷要用哪一份，這頁不讀也不寫。請先整理資料區只留一份。',
  missingOnSave: '資料區已經沒有個人資料（可能在別處被清除），這次修改沒有存。',
  missing: '還沒有已確認的個人資料：請先到匯入頁匯入履歷或手動輸入。',
  notImplemented: '目前連到的本機輔助程式還不支援個人資料編輯，請更新 RoleCraft。',
  unavailable: '連不到本機輔助程式：請確認 RoleCraft 已安裝並啟動後，按「重新讀取」。',
  unsaved: '尚未儲存',
  reloadWarning: '重新讀取會捨棄尚未儲存的修改。確定的話再按一次「重新讀取」。',
  reloaded: '已重新讀取已儲存的內容。',
} as const;

/** 一般失敗（沒有固定原因可分的）給人看的文字；不回填請求內容。 */
export function failureText(failure: BridgeFailure): string {
  const { code, message } = failure.error;
  if (code === 'helper_unavailable') {
    return helperUnavailableText(failure, PROFILE_PAGE_TEXT.unavailable);
  }
  if (code === 'not_implemented') return PROFILE_PAGE_TEXT.notImplemented;
  if (code === 'invalid_request' && failure.error.reason === 'multiple_profiles') {
    return PROFILE_PAGE_TEXT.multiple;
  }
  return message;
}
