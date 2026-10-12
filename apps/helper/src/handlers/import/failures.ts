import type { BridgeFailure } from '@rolecraft/contracts';

import type { AiParseRefusal } from './service.ts';

/** importId 不是 helper 配發的（或已清掉）。訊息是固定文字，不回填請求內容。 */
export function unknownImport(): BridgeFailure {
  return {
    ok: false,
    error: { code: 'invalid_request', message: '找不到這筆匯入，請重新選擇 PDF' },
  };
}

/** 不開始 AI 整理的原因（P1-T069；網頁姓名 P1-T080）；固定文字，都沒有呼叫模型。 */
const AI_REFUSALS: Record<Exclude<AiParseRefusal, 'unknown_import'>, string> = {
  name_required: '這頁沒有辨識出姓名：請先確認姓名後再用 AI 整理（未送 AI 整理）',
  name_parts_over_limit: '姓名欄位過多，請改用手動輸入',
  not_parsed: '這份 PDF 沒有可整理的文字，未送 AI 整理',
  no_text: '移除姓名與聯絡資料後沒有其他文字，未送 AI 整理',
  no_service: '沒有可用的 AI 服務：請到設定頁檢查並選定模型（未送 AI 整理）',
  over_budget: '履歷文字超過這次可送出的輸入預算，未送 AI 整理',
};

export function aiParseRefused(reason: AiParseRefusal): BridgeFailure {
  if (reason === 'unknown_import') return unknownImport();
  if (reason === 'name_required') {
    const message = AI_REFUSALS[reason];
    return { ok: false, error: { code: 'invalid_request', message, reason: 'name_required' } };
  }
  return { ok: false, error: { code: 'invalid_request', message: AI_REFUSALS[reason] } };
}
