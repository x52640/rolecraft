// 生成端拿不到可用模型時給使用者看的具體原因（P1-T070）。文字只由狀態欄位組成，
// versionCheck.reason 已在 claude-probe 去掉路徑（R7）；不含帳號、環境變數值。
import type { ServiceStatus } from './service.ts';

/** Claude 狀態 → 為什麼現在不能執行；可用且已選定模型時回 null。 */
export function claudeUnavailableReason(status: ServiceStatus | undefined): string | null {
  if (!status) return 'Claude 服務沒有接上，請到設定頁檢查';
  switch (status.state) {
    case 'tool_missing':
      return '找不到官方 Claude CLI（Claude Code），請先安裝，再到設定頁按「重新檢查」';
    case 'not_logged_in':
      return 'Claude Code 尚未登入，請用 Claude 訂閱帳號登入後再試';
    case 'quota_exhausted':
      return 'Claude 訂閱額度已用完，請等額度恢復後再試';
    case 'eligibility_unknown':
      return status.checkedAt === null
        ? '還沒能檢查 Claude 服務，請到設定頁按「重新檢查」'
        : '無法確認 Claude 的登入方式或方案（需以訂閱帳號登入），請到設定頁按「重新檢查」';
    case 'unsupported':
      return unsupportedReason(status);
    case 'available':
      return status.selectedCandidateId === null ? '尚未選定模型，請到設定頁選定模型' : null;
  }
}

function unsupportedReason(status: ServiceStatus): string {
  const version = status.versionCheck;
  if (version?.state === 'failed') {
    return `目前的 Claude CLI 版本未通過驗證、已停用：${version.reason}；可到設定頁按「重新啟用」`;
  }
  if (version?.state === 'incomplete' || version?.state === 'running') {
    return `目前的 Claude CLI 版本驗證尚未完成：${version.reason}`;
  }
  if (status.subscriptionOnly === 'failed') {
    return '偵測到會改走 API key 或其他計費方式的設定（訂閱路線不成立），未執行；請到設定頁查看';
  }
  return '目前的 Claude CLI 版本尚未驗證或無法確認隔離，未執行；請到設定頁按「重新檢查」';
}

let lastReason: string | null = null;

/**
 * 記下最近一次解析模型的結果（helper 是單一使用者的單一程序）：生成端解析不到模型時記原因、
 * 解析到就清掉。失敗訊息（analysis、resume、intro、messages）讀它組出具體原因。
 */
export function noteClaudeUnavailable(reason: string | null): void {
  lastReason = reason;
}

/** 失敗訊息用：有記到原因就接在固定文字後面。 */
export function withUnavailableReason(fallback: string): string {
  return lastReason === null ? fallback : `沒有可用的 AI 服務：${lastReason}`;
}
