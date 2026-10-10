import type { BridgeFailure } from '@rolecraft/contracts';

import type { DraftRefusal } from './service.ts';

/** 固定文字（給人看）；不回填請求內容。 */
const MESSAGES: Record<DraftRefusal, string> = {
  not_found: '找不到這則訊息',
  intent_unclear: '回覆意圖不明：請選擇接受邀約、詢問職務或婉拒',
  snapshot_missing: '找不到這則訊息關聯的職缺快照',
  snapshot_not_confirmed: '關聯的職缺快照尚未確認：請先到職缺頁確認',
  no_service: '沒有可用的 AI 服務：請到設定頁檢查並選定模型',
  busy: '這則訊息的草稿正在產生，請稍候',
};

export function draftRefused(reason: DraftRefusal): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: MESSAGES[reason] } };
}

export function messageNotFound(): BridgeFailure {
  return draftRefused('not_found');
}
