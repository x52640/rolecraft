// Claude「重新啟用」的背景執行（D24、P1-T062）。重新驗證要跑數分鐘，橋接請求不能等它：
// 按下後立即回覆，背景跑完再重新檢查狀態；進度與結果放在 Claude 狀態的 versionCheck／lastReverify，
// 編輯器輪詢 providers.status 取得。同一時間只跑一個；與一般執行的互斥由版本閘門負責。
import type { LastReverify, VersionCheck } from '@rolecraft/contracts';

import type { ClaudeProbe, ClaudeReverify } from './claude-probe.ts';
import type { ServiceStatus } from './service.ts';

export const REVERIFY_RUNNING_REASON =
  '正在重新驗證目前的 Claude CLI 版本（重跑注入測試，可能需要幾分鐘）；期間不執行任何 Claude 工作';

export interface ClaudeReverifyRunner {
  /** 把重新驗證狀態疊到 Claude 的狀態上 */
  decorate(status: ServiceStatus): ServiceStatus;
  /** 每次重新檢查後記下目前版本的問題（停用／未完成） */
  noteCheck(issue: VersionCheck | null): void;
  /** 開始背景重新驗證；已有一次在跑 → false */
  start(): boolean;
  /** 進行中的背景工作（測試等它結束用） */
  readonly task: Promise<void> | null;
}

export function createClaudeReverifyRunner(
  probe: Pick<ClaudeProbe, 'reverify'>,
  refresh: () => Promise<unknown>,
  now: () => Date = () => new Date(),
): ClaudeReverifyRunner {
  let issue: VersionCheck | null = null;
  let last: LastReverify | null = null;
  let task: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    let result: ClaudeReverify;
    try {
      result = probe.reverify
        ? await probe.reverify()
        : { outcome: 'blocked', reason: '這個環境沒有接上 Claude 重新啟用' };
    } catch {
      result = { outcome: 'blocked', reason: '重新啟用途中發生錯誤，沒有改變目前狀態' };
    }
    // 有跑注入測試（通過或失敗）才重新檢查：失敗的版本與已接受的版本都不會再呼叫模型。
    if (result.outcome === 'passed' || result.outcome === 'failed') {
      await refresh().catch(() => undefined);
    }
    last = { outcome: result.outcome, reason: result.reason, finishedAt: now().toISOString() };
  };

  return {
    decorate(status) {
      const running: VersionCheck = { state: 'running', reason: REVERIFY_RUNNING_REASON };
      return { ...status, versionCheck: task ? running : issue, lastReverify: last };
    },
    noteCheck(next) {
      issue = next;
    },
    start() {
      if (task) return false;
      task = run().finally(() => {
        task = null;
      });
      return true;
    },
    get task() {
      return task;
    },
  };
}
