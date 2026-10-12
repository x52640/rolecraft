import type {
  BridgeResponseOf,
  CheckOutcome,
  Provider,
  ReverifyOutcome,
  VersionCheckState,
} from '@rolecraft/contracts';

export type ServiceStatus = Extract<
  BridgeResponseOf<'providers.status'>,
  { ok: true }
>['services'][number];
export type ServiceState = ServiceStatus['state'];
export type ServiceCandidate = Extract<
  BridgeResponseOf<'providers.list_candidates'>,
  { ok: true }
>['candidates'][number];

export const SERVICE_ORDER: readonly Provider[] = ['claude', 'codex', 'antigravity'];

export const SERVICE_NAMES: Readonly<Record<Provider, string>> = {
  claude: 'Claude（Anthropic）',
  codex: 'ChatGPT／Codex（OpenAI）',
  antigravity: 'Google Antigravity',
};

/** 狀態標籤與給人看的下一步（S9-1、S9-3）。 */
export const STATE_TEXT: Readonly<Record<ServiceState, { label: string; hint: string }>> = {
  tool_missing: {
    label: '工具缺少',
    hint: '找不到官方 CLI。請先依官方說明安裝，再按「重新檢查」。',
  },
  not_logged_in: {
    label: '未登入',
    hint: '官方工具沒有以訂閱帳號登入（或改用了 API key）。請依下方「官方登入」說明登入後重新檢查。',
  },
  eligibility_unknown: {
    label: '資格未知',
    hint: '還沒檢查，或官方工具沒有回報方案資訊。已登入不等於有訂閱，也不等於可以免額外付費。',
  },
  available: {
    label: '可用',
    hint: '已確認以訂閱登入、隔離設定已驗證。每次執行前仍會重新確認。',
  },
  quota_exhausted: {
    label: '額度不足',
    hint: '官方工具回報訂閱額度已用完；工作會停止並保留進度，等額度恢復後再手動續跑。',
  },
  unsupported: {
    label: '尚未支援',
    hint: '這個服務的隔離或「只走訂閱、不額外收費」目前無法確認，所以不會使用。',
  },
};

export const CHECK_TEXT: Readonly<Record<CheckOutcome, string>> = {
  passed: '通過',
  failed: '未通過',
  unknown: '無法確認',
};

export const VERIFY_TEXT: Readonly<Record<CheckOutcome, string>> = {
  passed: '已驗證可用，之後的工作會用這個模型。',
  failed: '驗證失敗，沒有改變目前的選擇。',
  unknown: '執行前確認沒有通過，未驗證；沒有改變目前的選擇。',
};

/** Claude CLI 版本重新驗證（D22、D24；P1-T062）。 */
export const VERSION_CHECK_TITLE: Readonly<Record<VersionCheckState, string>> = {
  running: '正在重新驗證',
  failed: '這個版本的 Claude CLI 已停用',
  incomplete: '需要重新驗證',
};

/** 呼叫次數對應 providers 的重新驗證流程（實際 2 次，硬上限 CLAUDE_REVERIFY_MAX_MODEL_CALLS＝3）。 */
export const REVERIFY_COST_NOTE =
  '重新啟用會對目前版本重跑一次隔離與「只走訂閱」的安全測試：約 2 次、最多 3 次極短的模型呼叫' +
  '（用最便宜的模型，算在你的訂閱額度內），可能需要幾分鐘。通過才恢復使用，不會不測就放行。';

export const REVERIFY_RESULT_TEXT: Readonly<Record<ReverifyOutcome, string>> = {
  passed: '上次重新啟用：通過，已恢復使用。',
  failed: '上次重新啟用：沒有通過，這個版本仍停用。',
  not_needed: '上次重新啟用：目前版本不需要重新啟用，沒有呼叫模型。',
  blocked: '上次重新啟用：沒有開始。',
};

/** 首版只接 Claude（D13）。 */
export const isFirstVersionSupported = (service: Provider): boolean => service === 'claude';

export function formatTime(iso: string | null): string {
  if (!iso) return '尚未檢查';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-TW');
}
