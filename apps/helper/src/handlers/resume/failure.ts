import type { BridgeFailure } from '@rolecraft/contracts';

import { withUnavailableReason } from '../providers/unavailable-reason.ts';

import type { ResumeFailureReason, ResumeResult } from './service.ts';

const MESSAGES: Record<ResumeFailureReason, string> = {
  version_not_found: '找不到這個履歷版本或段落',
  snapshot_not_found: '找不到這個職缺快照',
  snapshot_not_confirmed: '職缺快照尚未確認，確認後才能產生履歷',
  profile_not_confirmed: '個人資料尚未建立或尚未確認，確認後才能產生履歷',
  no_usable_claims: '沒有可用的事實項（待複核、來源矛盾等不會用於生成），請先到事實項頁處理',
  over_budget: '資料量超過模型的輸入上限，未送出',
  no_model: '尚未選定可用的模型，請先到設定頁檢查服務並選定模型',
  already_running: '這個職缺已有履歷正在產生，請稍候',
  citation_removed: '不能只移除引用；要去掉引用只能刪除整段',
  citation_invalid: '引用重複，或新增的引用指向不存在的事實項',
  completion_downgrade_unacknowledged:
    '有引用的完成程度被調低，請重看本段措辭，確認沒有寫得比引用更完成後再儲存',
  text_mismatch: '段落內容已改變，請重新讀取後再確認',
  not_section_confirmable:
    '這段有完成程度、事實項狀態或引用完整性問題，不能用逐段確認放行；請改寫、刪除或到事實項確認',
  blank_section: '空白段落不需確認',
};

/** 沒有可用的服務時接上具體原因（P1-T070：未登入、方案不符、CLI 版本待驗證等）。 */
const messageOf = (reason: ResumeFailureReason): string =>
  reason === 'no_model' ? withUnavailableReason(MESSAGES[reason]) : MESSAGES[reason];

/** 履歷操作失敗：一律 invalid_request，訊息是固定文字，不回填請求內容。 */
export function resumeFailure(reason: ResumeFailureReason): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: messageOf(reason) } };
}

export function ackOrFailure(result: ResumeResult): { ok: true } | BridgeFailure {
  return result.ok ? { ok: true } : resumeFailure(result.reason);
}
