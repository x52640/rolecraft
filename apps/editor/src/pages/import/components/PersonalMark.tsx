import { PERSONAL_MARK } from '../ai-form.ts';

/**
 * 「含姓名或聯絡資料」標示（D28／W7）：AI 草稿還原佔位字時還原出姓名或聯絡資料的欄位，
 * 提醒使用者確認前刪掉（確認後的文字之後產生履歷、自介會照現行規則送出）。
 */
export function PersonalMark() {
  return (
    <span role="note" aria-label={PERSONAL_MARK} className="import-personal-mark">
      {' '}
      {PERSONAL_MARK}
    </span>
  );
}
