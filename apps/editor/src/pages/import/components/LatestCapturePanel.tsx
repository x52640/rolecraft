import { PLATFORM_LABELS, formatTime } from '../../jobs/labels.ts';
import type { LatestCaptureState } from '../useLatestCapture.ts';

/**
 * 最近一次網頁擷取（D28、Q3）：平台、擷取時間、是否截斷、「使用這份」。
 * 查詢與顯示都不會呼叫 AI；按「使用這份」只開啟核對（import.get），AI 要再按「用 AI 整理」。
 */
export function LatestCapturePanel(props: {
  state: LatestCaptureState;
  onUse: (importId: string) => void;
  onRefresh: () => void;
  disabled: boolean;
}) {
  const { state, onUse, onRefresh, disabled } = props;
  return (
    <section className="import-card import-capture" aria-label="最近一次網頁擷取">
      <h2 className="import-card-title">最近一次網頁擷取</h2>
      {state.kind === 'loading' && <p className="import-hint">查詢中…</p>}
      {state.kind === 'none' && (
        <p className="import-hint">
          還沒有擷取。請在求職網站的履歷頁點工具列的 RoleCraft
          圖示（或按快捷鍵）擷取，再按「重新查詢」。
        </p>
      )}
      {state.kind === 'unavailable' && (
        <p className="import-hint">查不到最近的擷取（本機輔助程式可能沒有啟動）。</p>
      )}
      {state.kind === 'found' && (
        <>
          <p>
            平台：<strong>{PLATFORM_LABELS[state.capture.platform]}</strong>
            ｜擷取時間：{formatTime(state.capture.capturedAt)}
          </p>
          {state.capture.truncated && (
            <p role="note" aria-label="擷取不完整" className="import-warning">
              內容不完整：頁面超過擷取上限，只保留了前面的區塊。
            </p>
          )}
          <p className="import-hint">按「使用這份」只會開啟核對，不會送給 AI。</p>
        </>
      )}
      <p className="import-actions">
        {state.kind === 'found' && (
          <button
            type="button"
            className="import-btn import-btn-primary"
            disabled={disabled}
            onClick={() => onUse(state.capture.importId)}
          >
            使用這份
          </button>
        )}
        <button
          type="button"
          className="import-btn import-btn-secondary"
          disabled={disabled}
          onClick={onRefresh}
        >
          重新查詢
        </button>
      </p>
    </section>
  );
}
