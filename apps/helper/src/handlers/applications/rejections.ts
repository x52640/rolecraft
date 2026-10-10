// 服務拒絕原因 → 橋接失敗回應。訊息是固定文字，不回填請求內容（bridge.md 錯誤碼）。
import type { BridgeFailure } from '@rolecraft/contracts';

import type { ApplicationsRejection } from './service.ts';

const MESSAGES: Record<ApplicationsRejection, string> = {
  application_not_found: '找不到這筆投遞紀錄',
  export_version_not_found: '實際投出版本只能選既有的匯出版本',
  export_version_locked: '實際投出版本建立後不能更改；請刪除這筆紀錄後重新新增',
};

export function rejected(reason: ApplicationsRejection): BridgeFailure {
  return { ok: false, error: { code: 'invalid_request', message: MESSAGES[reason] } };
}
