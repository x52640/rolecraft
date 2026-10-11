import type { AnalysisBlockReason, AnalysisStatusView, PauseReason } from '@rolecraft/contracts';

import { useAnalysis } from './useAnalysis.ts';

const PAUSE_TEXT: Record<PauseReason, string> = {
  quota_exhausted: '額度用完',
  user_cancelled: '已取消',
  retries_exhausted: '暫時性錯誤重試多次仍失敗',
  interrupted: '本機輔助程式中途關閉或寫入失敗',
};

const BLOCK_TEXT: Record<AnalysisBlockReason, string> = {
  run_check_failed: '訂閱路線確認沒有通過（請到設定頁重新檢查服務）',
  provider_error: 'AI 服務回報無法重試的錯誤（請到設定頁重新檢查服務）',
  sources_changed: '暫停期間文件有變更，需要重新分析',
};

function describe(view: AnalysisStatusView): string {
  const progress = `已完成 ${String(view.completedUnits)}／${String(view.totalUnits)} 批`;
  const claims = `新增 ${String(view.claimsAdded)} 項、更新 ${String(view.claimsUpdated)} 項事實項`;
  switch (view.state) {
    case 'running':
      return `分析中：${progress}，${claims}。`;
    case 'completed':
      return `分析完成：${progress}，${claims}。`;
    case 'paused':
      return `已暫停（${view.pauseReason ? PAUSE_TEXT[view.pauseReason] : '原因不明'}）：${progress}，${claims}。`;
    case 'blocked':
      return `未能繼續（${view.blockReason ? BLOCK_TEXT[view.blockReason] : '原因不明'}）：${progress}，${claims}。`;
  }
}

/**
 * 「分析資料夾」按鈕與進度（P1-T060）。暫停或被擋時按鈕變「繼續分析」；
 * 續跑只在使用者按下時發生（D21），頁面不會自己續跑。
 */
export function AnalysisPanel() {
  const { load, busy, notice, start } = useAnalysis();
  const view = load.state === 'ready' ? load.value : null;
  const running = view?.state === 'running';
  const resumable = view?.state === 'paused' || view?.state === 'blocked';
  return (
    <section aria-labelledby="analysis-title">
      <h2 id="analysis-title">分析</h2>
      <p>
        把已授權的文件交給設定頁選定的 AI
        服務整理成事實項；只會讀已授權的文件，只分析新增或變更的部分。
      </p>
      <button type="button" disabled={busy || running} onClick={() => void start()}>
        {running ? '分析中…' : resumable ? '繼續分析' : '分析資料夾'}
      </button>
      {load.state === 'error' && <p>分析進度：{load.message}</p>}
      {notice && <p role="status">{notice}</p>}
      {view && <p aria-label="分析進度">{describe(view)}</p>}
    </section>
  );
}
