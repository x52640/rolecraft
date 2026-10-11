import type { BridgeFailure } from '@rolecraft/contracts';

import { helperUnavailableText } from '../../bridge/helper-busy.ts';

/** 訊息頁顯示用文字（繁體中文）。 */

export type ReplyIntent = 'accept' | 'inquire' | 'decline';

/** 三種回覆意圖（F08）；畫面不預選，使用者要明確選一個。 */
export const INTENT_OPTIONS: readonly { value: ReplyIntent; label: string; hint: string }[] = [
  { value: 'accept', label: '接受邀約', hint: '表達有興趣、請對方提供後續安排' },
  { value: 'inquire', label: '詢問職務', hint: '針對職務內容、團隊提出問題' },
  { value: 'decline', label: '婉拒', hint: '禮貌婉拒、保持聯繫' },
];

/** 已存的意圖（helper 只會存三個固定值）；其他值當成「尚未選擇」。 */
export function knownIntent(value: string): ReplyIntent | null {
  return INTENT_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

export function intentLabel(value: string): string {
  return INTENT_OPTIONS.find((option) => option.value === value)?.label ?? '未選擇';
}

/** 橋接失敗給人看的說明；訊息本身是 helper／service worker 的固定文字。 */
export function failureText(failure: BridgeFailure): string {
  switch (failure.error.code) {
    case 'not_implemented':
      return '本機輔助程式尚未支援招募訊息（服務尚未接上）。';
    case 'helper_unavailable':
      return helperUnavailableText(failure, '連不到本機輔助程式：請確認已安裝並啟動。');
    case 'timeout':
      return '本機輔助程式沒有及時回應，請稍後再試。';
    default:
      return failure.error.message;
  }
}
