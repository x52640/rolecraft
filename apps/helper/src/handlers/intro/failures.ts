import type { BridgeFailure } from '@rolecraft/contracts';

import { withUnavailableReason } from '../providers/unavailable-reason.ts';

import type { IntroRefusal, UpdateIntroFailure } from './service.ts';

type IntroFailureReason = IntroRefusal | UpdateIntroFailure;

/** 固定文字（給人看）；不回填請求內容。 */
const MESSAGES: Record<IntroFailureReason, string> = {
  not_found: '找不到這個職缺快照',
  snapshot_not_confirmed: '職缺快照尚未確認：請先確認快照再產生投遞自介',
  no_usable_claims: '沒有可用的事實項：請先分析專案資料夾，或到事實項頁確認事實項',
  no_service: '沒有可用的 AI 服務：請到設定頁檢查並選定模型',
  over_budget: '內容超過這次可送出的輸入預算，未送出',
  no_intro: '這個職缺還沒有投遞自介：請先產生',
  no_draft:
    '找不到未通過的草稿（可能已被新的產生取代，或本機輔助程式重新啟動過）：請重新讀取或重新產生',
  draft_stale: '草稿產生後職缺快照被修改或取消確認：請重新產生投遞自介',
  draft_intro_changed:
    '草稿產生後已存的自介被改過，「請 AI 修正」的結果會蓋掉那份修改，所以沒有呼叫 AI（沒有用到額度）：請重新產生投遞自介，或直接修改已存的自介',
  draft_failed: '草稿仍沒有通過檢查，還不是正式自介；你的修改已保留在草稿上，問題標在草稿下方',
  snapshot_changed: '草稿產生後職缺快照被修改或取消確認，沒有存成正式自介：請重新產生投遞自介',
  intro_changed:
    '草稿產生後已存的自介被改過，為了不蓋掉那份修改，沒有存成正式自介：請重新產生投遞自介',
  generation_running: '投遞自介正在產生中，請等產生結束再儲存',
};

/** 沒有可用的服務時接上具體原因（P1-T070：未登入、方案不符、CLI 版本待驗證等）。 */
const messageOf = (reason: IntroFailureReason): string =>
  reason === 'no_service' ? withUnavailableReason(MESSAGES[reason]) : MESSAGES[reason];

export function introFailure(reason: IntroFailureReason): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: messageOf(reason) } };
}
