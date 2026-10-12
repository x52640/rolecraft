import type {
  BridgeFailure,
  ClaimType,
  CompletionStatus,
  IntroGenerationFailure,
  IntroProblem,
  StatedCompletion,
} from '@rolecraft/contracts';

import { helperUnavailableText } from '../../bridge/helper-busy.ts';

/** 投遞自介（P1-T064）顯示用文字（繁體中文）。 */

export const INTRO_PROBLEM_LABELS: Record<IntroProblem, string> = {
  empty: '自介是空白的',
  too_long: '超過 300 字（含標點與空白）',
  no_citation: '沒有引用任何事實項',
  unknown_claim: '引用的事實項已不存在或目前不能使用（例如來源已撤銷、待複核）',
  duplicate_citation: '重複引用同一個事實項',
  completion_not_stated: '引用功能或交付物時沒有標示完成程度',
  completion_not_applicable: '這類事實項沒有完成程度，不能標示',
  completion_exceeds_claim: '把尚未經你確認完成的事實寫成已完成',
  number_not_grounded: '有數字在引用的事實項、個人資料或你確認過的文字中找不到',
  link_not_grounded: '有網址或網域不在引用的事實項中',
  multiplier_not_grounded: '有倍數或比例說法（翻倍、減半等）不在引用的事實項中',
  commits_time: '提到時間或日期（不承諾面試時間）',
  commits_salary: '提到薪資待遇',
  commits_start_date: '提到到職、開始、加入等字眼（不承諾到職日）',
  contact_info: '包含 email 或通訊軟體帳號',
  export_check_failed: '沒有通過匯出前的事實檢查',
};

export const INTRO_FAILURE_LABELS: Record<IntroGenerationFailure, string> = {
  check_failed: '產生的自介沒有通過檢查',
  invalid_output: 'AI 回覆的格式不合格，已整份丟棄',
  run_check_failed: '送出前的訂閱檢查沒有通過，沒有送出',
  provider_error: 'AI 服務回報錯誤',
  quota_exhausted: '額度已用完',
  cancelled: '已取消',
  snapshot_changed: '產生期間職缺快照被修改或取消確認，結果沒有存下',
  intro_changed: '產生期間你改過自介，為了不蓋掉你的修改，結果沒有存下',
};

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  feature: '功能',
  deliverable: '交付物',
  personal_role: '個人角色',
  outcome_metric: '成果數字',
  user_count: '使用人數',
  link: '連結',
};

export const CLAIM_STATUS_LABELS: Record<CompletionStatus, string> = {
  planned: '計畫中',
  documented_done: '文件標示完成',
  user_confirmed_done: '使用者確認完成',
  unknown: '未知',
};

export const STATED_COMPLETION_LABELS: Record<StatedCompletion, string> = {
  completed: '已完成',
  in_progress: '進行中',
  planned: '規劃中',
};

/** 產生失敗的完整說明。 */
export function generationFailureText(
  failure: IntroGenerationFailure,
  problem: IntroProblem | null,
): string {
  const base = INTRO_FAILURE_LABELS[failure];
  const detail = problem ? `：${INTRO_PROBLEM_LABELS[problem]}` : '';
  return `${base}${detail}。可以改寫或重新產生。`;
}

/** 橋接失敗給人看的說明；訊息本身是 helper／service worker 的固定文字。 */
export function introFailureText(failure: BridgeFailure): string {
  switch (failure.error.code) {
    case 'not_implemented':
      return '本機輔助程式尚未支援投遞自介（服務尚未接上）。';
    case 'helper_unavailable':
      return helperUnavailableText(failure, '連不到本機輔助程式：請確認已安裝並啟動。');
    case 'timeout':
      return '本機輔助程式沒有及時回應，請稍後再試。';
    default:
      return failure.error.message;
  }
}
