import {
  formatTime,
  REVERIFY_COST_NOTE,
  REVERIFY_RESULT_TEXT,
  type ServiceStatus,
  VERSION_CHECK_TITLE,
} from './labels.ts';

interface ReverifyPanelProps {
  status: ServiceStatus;
  /** 送出重新啟用請求中（helper 還沒回覆） */
  starting: boolean;
  onReverify: () => void;
}

/**
 * Claude CLI 目前版本停用或需要重新驗證時：顯示原因與「重新啟用」（D24、P1-T062）。
 * 按下只是要求 helper 重跑注入測試，通過才恢復；執行中按鈕停用，結果由頁面輪詢狀態取得。
 */
export function ReverifyPanel({ status, starting, onReverify }: ReverifyPanelProps) {
  const check = status.versionCheck ?? null;
  const last = status.lastReverify ?? null;
  const running = check?.state === 'running';
  if (!check && !last) return null;
  return (
    <section className="reverify" aria-label="重新驗證">
      {check ? (
        <>
          <h3>{VERSION_CHECK_TITLE[check.state]}</h3>
          <p role={running ? 'status' : undefined}>{check.reason}</p>
          <p className="hint">{REVERIFY_COST_NOTE}</p>
          <button type="button" onClick={onReverify} disabled={running || starting}>
            {running || starting ? '重新驗證中…' : '重新啟用'}
          </button>
        </>
      ) : null}
      {last && !running ? (
        <p role="status">
          {REVERIFY_RESULT_TEXT[last.outcome]}
          {last.reason ? `（${last.reason}）` : ''}
          <span className="hint">{` ${formatTime(last.finishedAt)}`}</span>
        </p>
      ) : null}
    </section>
  );
}
