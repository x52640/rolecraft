/** 固定在視窗底部的確認列：勾選核對＋確認寫入；不用捲到底才看得到。 */
export function ConfirmBar(props: { checked: boolean; onCheck: (checked: boolean) => void }) {
  const { checked, onCheck } = props;
  return (
    <div className="import-confirm-bar" role="group" aria-label="確認列">
      <p role="note" aria-label="尚未存入提醒" className="import-hint">
        存入前離開頁面，修改不會保留。
      </p>
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
