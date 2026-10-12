import { useState } from 'react';

import { PROFILE_PAGE_TEXT } from '../profile-text.ts';

interface SaveBarProps {
  dirty: boolean;
  locked: boolean;
  saving: boolean;
  /** 表單的編輯版本：確認只對按下當時的內容有效，表單一變就要重新確認 */
  editVersion: number;
  /** 改了公司、職稱、開始的經歷與整段刪掉的經歷（「公司｜職稱」） */
  unmatched: { readonly changed: readonly string[]; readonly removed: readonly string[] };
  onSave: () => void;
  onReload: () => void;
}

/**
 * 儲存列：「尚未儲存」標示、儲存前提示（不回溯已產生的履歷）、對不到經歷的提示與再按一次確認、
 * 重新讀取（有未存修改時再按一次確認）。只有使用者按下才儲存，沒有自動儲存。
 */
export function SaveBar(props: SaveBarProps) {
  const { dirty, locked, saving, editVersion, unmatched, onSave, onReload } = props;
  const [saveAt, setSaveAt] = useState<number | null>(null);
  const [reloadAt, setReloadAt] = useState<number | null>(null);
  const risky = unmatched.changed.length + unmatched.removed.length > 0;
  const confirmSave = risky && saveAt === editVersion;
  const confirmReload = dirty && reloadAt === editVersion;

  const save = () => {
    if (risky && !confirmSave) {
      setSaveAt(editVersion);
      return;
    }
    setSaveAt(null);
    onSave();
  };
  const reload = () => {
    if (dirty && !confirmReload) {
      setReloadAt(editVersion);
      return;
    }
    setReloadAt(null);
    onReload();
  };

  return (
    <div className="pf-savebar">
      <p className="pf-hint">{PROFILE_PAGE_TEXT.beforeSave}</p>
      {risky ? (
        <div role="note" aria-label="對不到經歷的提示" className="pf-warning">
          <p>{PROFILE_PAGE_TEXT.unmatched}</p>
          <ul>
            {unmatched.changed.map((name, i) => (
              <li key={`c${String(i)}`}>改了公司、職稱或開始：{name}</li>
            ))}
            {unmatched.removed.map((name, i) => (
              <li key={`r${String(i)}`}>刪除整段：{name}</li>
            ))}
          </ul>
          {unmatched.removed.length > 0 ? <p>{PROFILE_PAGE_TEXT.removeKeepsPdf}</p> : null}
          {confirmSave ? <p>確定的話再按一次「儲存」。</p> : null}
        </div>
      ) : null}
      <div className="pf-actions">
        {dirty ? (
          <span className="pf-tag pf-tag-unsaved" data-testid="unsaved">
            {PROFILE_PAGE_TEXT.unsaved}
          </span>
        ) : null}
        <button type="button" disabled={locked || !dirty} onClick={save}>
          {saving ? '儲存中…' : '儲存'}
        </button>
        <button type="button" disabled={locked} onClick={reload}>
          重新讀取
        </button>
      </div>
      {confirmReload ? <p className="pf-warning">{PROFILE_PAGE_TEXT.reloadWarning}</p> : null}
    </div>
  );
}
