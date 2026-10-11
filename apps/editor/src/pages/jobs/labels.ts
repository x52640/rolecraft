import type { BridgeFailure, CaptureMethod, Platform } from '@rolecraft/contracts';

import { helperUnavailableText } from '../../bridge/helper-busy.ts';

/** 職缺頁顯示用文字（繁體中文）。 */

export const PLATFORM_LABELS: Record<Platform, string> = {
  '104': '104',
  cake: 'Cake',
  yourator: 'Yourator',
  linkedin: 'LinkedIn',
};

/** 擷取方式照實顯示：手動貼上不得標成自動（R10）。 */
export const CAPTURE_METHOD_LABELS: Record<CaptureMethod, string> = {
  auto: '自動擷取',
  manual_paste: '手動貼上',
};

export const REQUIRED_FIELD_LABELS = {
  company: '公司',
  title: '職稱',
  description: '職缺描述',
} as const;

export const OPTIONAL_FIELD_LABELS = {
  responsibilities: '職責',
  requirements: '必要條件',
  preferredQualifications: '加分條件',
  location: '地點',
} as const;

/** 選用欄位空白時的兩種標示（R10）：要分開，不可混用。 */
export const EMPTY_STATUS_LABELS = {
  not_captured: '未擷取到',
  not_provided: '頁面未提供',
} as const;

export const EMPTY_STATUS_HINTS = {
  not_captured: '找不到這個欄位，或手動貼上時沒有整理出來',
  not_provided: '頁面上有這個欄位，但內容是空的',
} as const;

/** 時間顯示：當地時間；格式錯就原樣顯示。 */
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString('zh-TW', { hour12: false });
}

/** 橋接失敗給人看的說明；訊息本身是 helper／service worker 的固定文字。 */
export function failureText(failure: BridgeFailure): string {
  switch (failure.error.code) {
    case 'not_implemented':
      return '本機輔助程式尚未支援職缺快照（服務尚未接上）。';
    case 'helper_unavailable':
      return helperUnavailableText(failure, '連不到本機輔助程式：請確認已安裝並啟動。');
    case 'timeout':
      return '本機輔助程式沒有及時回應，請稍後再試。';
    default:
      return failure.error.message;
  }
}
