import type { ProfileForm } from '../form-model.ts';
import { ConfirmSummary } from './ConfirmSummary.tsx';

/** 網頁來源（D29）的確認方式：不勾選、不強制看標黃欄位，只顯示摘要與提醒。 */
export interface RemindMode {
  form: ProfileForm;
  /** 目前標黃的欄位數（只是提醒，不擋確認） */
  flagged: number;
}

/**
 * 固定在視窗底部的確認列，不用捲到底才看得到。
 * - PDF、手動輸入：勾選「我已逐欄核對」才能確認（現行）。
 * - 網頁來源（remind）：沒有勾選；顯示精簡摘要與標黃提醒，確認鈕不因標黃停用（擁有者 2026-10-13 再裁定）。
 * 兩種都只有使用者按下確認才寫入（D4）。
 */
export function ConfirmBar(props: {
  checked: boolean;
  onCheck: (checked: boolean) => void;
  /** 上次送出時的待修正項數；大於 0 時在確認列提示（清單本身可能在畫面外）。 */
  problemCount: number;
  /** AI 整理中（P1-T069）：不能勾選、不能確認 */
  locked?: boolean;
  remind?: RemindMode | undefined;
  /** remind 模式按下確認：只由按鈕觸發（表單裡按 Enter 不會寫入） */
  onConfirm: () => void;
}) {
  const { checked, onCheck, problemCount, locked = false, remind, onConfirm } = props;
  return (
    <div className="import-confirm-bar" role="group" aria-label="確認列">
      <div className="import-confirm-messages">
        {problemCount > 0 && (
          <p className="import-error">有 {problemCount} 項需要修正，請看表單下方的清單。</p>
        )}
        {remind && <ConfirmSummary form={remind.form} />}
        {remind && (
          <p role="note" aria-label="確認提示" className="import-hint">
            {remind.flagged > 0 ? `有 ${String(remind.flagged)} 個標黃欄位。` : ''}
            沒看也能確認；產生履歷前建議到個人資料頁檢查一次。
          </p>
        )}
        <p role="note" aria-label="取代提醒" className="import-hint">
          確認後會取代目前的個人資料（資料區只保留一份個人資料）。
        </p>
        <p role="note" aria-label="尚未存入提醒" className="import-hint">
          存入前離開頁面，修改不會保留。
        </p>
      </div>
      {!remind && (
        <label className="import-inline-check">
          <input
            type="checkbox"
            checked={checked}
            disabled={locked}
            onChange={(e) => onCheck(e.target.checked)}
          />
          我已逐欄核對，以上內容正確
        </label>
      )}
      <button
        type={remind ? 'button' : 'submit'}
        className="import-btn import-btn-primary"
        disabled={locked || (!remind && !checked)}
        onClick={remind ? onConfirm : undefined}
      >
        確認並寫入個人資料
      </button>
    </div>
  );
}
