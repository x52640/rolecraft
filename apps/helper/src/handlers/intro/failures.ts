import type { BridgeFailure } from '@rolecraft/contracts';

import type { IntroRefusal } from './service.ts';

type IntroFailureReason = IntroRefusal | 'no_intro';

/** 固定文字（給人看）；不回填請求內容。 */
const MESSAGES: Record<IntroFailureReason, string> = {
  not_found: '找不到這個職缺快照',
  snapshot_not_confirmed: '職缺快照尚未確認：請先確認快照再產生投遞自介',
  no_usable_claims: '沒有可用的事實項：請先分析專案資料夾，或到事實項頁確認事實項',
  no_service: '沒有可用的 AI 服務：請到設定頁檢查並選定模型',
  over_budget: '內容超過這次可送出的輸入預算，未送出',
  no_intro: '這個職缺還沒有投遞自介：請先產生',
};

export function introFailure(reason: IntroFailureReason): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: MESSAGES[reason] } };
}
