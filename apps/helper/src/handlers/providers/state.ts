// 狀態判定（純函式）：分清工具缺少、未登入、資格未知、可用、額度不足、尚未支援（S9-1、S9-3）。
// 只有 R5（隔離：已驗證版本、未停用）與 R6（訂閱路線總結）都 passed 才可能是 available。
import type { Provider } from '@rolecraft/contracts';

import type { ClaudeCheck } from './claude-probe.ts';
import type { ServiceStatus } from './service.ts';

export type ServiceState = ServiceStatus['state'];

/** 首版只有 Claude 有適配（D13）；其餘一律「尚未支援」，不做任何檢查、不啟動任何程式。 */
export const SUPPORTED_SERVICES: readonly Provider[] = ['claude'];
export const ALL_SERVICES: readonly Provider[] = ['claude', 'codex', 'antigravity'];

export function claudeState(check: ClaudeCheck, quotaExhausted: boolean): ServiceState {
  if (check.installed === 'failed') return 'tool_missing';
  // 找到了但讀不到版本、或版本未驗證／服務停用：R5 證明不了 → 尚未支援（S8）。
  if (check.installed !== 'passed' || check.isolation !== 'passed') return 'unsupported';
  if (check.login === 'failed') return 'not_logged_in';
  // R6 明確不成立（例如設定改走 API key）：零額外收費條件不成立 → 尚未支援（S8）。
  if (check.subscriptionOnly === 'failed') return 'unsupported';
  if (check.login !== 'passed' || check.subscriptionOnly !== 'passed') {
    return 'eligibility_unknown';
  }
  if (check.eligibility !== 'passed') return 'eligibility_unknown';
  if (quotaExhausted) return 'quota_exhausted';
  return 'available';
}

/** 從未檢查過的初始狀態：不顯示為可用。 */
export function initialStatus(service: Provider): ServiceStatus {
  return {
    service,
    state: SUPPORTED_SERVICES.includes(service) ? 'eligibility_unknown' : 'unsupported',
    login: 'unknown',
    eligibility: 'unknown',
    subscriptionOnly: 'unknown',
    checkedAt: null,
    selectedCandidateId: null,
  };
}
