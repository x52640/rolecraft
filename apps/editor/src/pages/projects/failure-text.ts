import type { BridgeFailure } from '@rolecraft/contracts';

import { helperUnavailableText } from '../../bridge/helper-busy.ts';

/** 橋接失敗 → 給使用者看的一句話。程式判斷只看代碼；訊息本身是 helper 的固定文字。 */
export function failureText(failure: BridgeFailure): string {
  switch (failure.error.code) {
    case 'not_implemented':
      return '本機輔助程式尚未支援這個操作。';
    case 'helper_unavailable':
      return helperUnavailableText(failure, '連不到本機輔助程式，請確認已安裝並啟動。');
    case 'timeout':
      return '本機輔助程式沒有回應，請再試一次。';
    default:
      return failure.error.message;
  }
}
