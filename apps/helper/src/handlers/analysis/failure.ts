import type { BridgeFailure } from '@rolecraft/contracts';

import type { AnalysisFailureReason } from './service.ts';

const MESSAGES: Record<AnalysisFailureReason, string> = {
  no_model: '尚未選定可用的模型，請先到設定頁檢查服務並選定模型',
  run_check_failed: '訂閱路線確認沒有通過，未續跑；請到設定頁重新檢查服務',
  folder_unreadable: '有資料夾無法讀取（可能已被移動或刪除），請移除後重新加入再分析',
  over_budget: '有文件超過模型的輸入上限，未送出',
  no_documents: '沒有可分組的文件（需要已授權、已分析過、尚未屬於任何專案的文件），未送出',
};

/** 分析操作失敗：一律 invalid_request，訊息是固定文字。 */
export function analysisFailure(reason: AnalysisFailureReason): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: MESSAGES[reason] } };
}
