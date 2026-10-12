/** 固定在視窗底部的確認列：勾選核對＋確認寫入；不用捲到底才看得到。 */
export function ConfirmBar(props: {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  /** 上次送出時的待修正項數；大於 0 時在確認列提示（清單本身可能在畫面外）。 */
  problemCount: number;
}) {
  const { checked, onCheck, problemCount } = props;
  return (
    <div className="import-confirm-bar" role="group" aria-label="確認列">
      <div className="import-confirm-messages">
        {problemCount > 0 && (
          <p className="import-error">有 {problemCount} 項需要修正，請看表單下方的清單。</p>
        )}
        <p role="note" aria-label="尚未存入提醒" className="import-hint">
          存入前離開頁面，修改不會保留。
        </p>
      </div>
      <label className="import-inline-check">
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        我已逐欄核對，以上內容正確
      </label>
      <button type="submit" className="import-btn import-btn-primary" disabled={!checked}>
        確認並寫入個人資料
      </button>
    </div>
  );
}
