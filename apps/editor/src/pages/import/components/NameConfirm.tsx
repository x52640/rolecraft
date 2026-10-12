import { IMPORT_AI_PARSE_MAX_NAMES, IMPORT_AI_PARSE_NAME_MAX_CHARS } from '@rolecraft/contracts';
import { useEffect, useId, useState } from 'react';

import { useBridge } from '../../../bridge/BridgeProvider.tsx';

/** 姓名寫法 → 送出用的清單；有問題回說明。 */
export function checkNames(names: readonly string[]): string[] | string {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter((n) => n !== ''))];
  if (cleaned.length === 0) return '請至少填一個姓名寫法';
  if (cleaned.length > IMPORT_AI_PARSE_MAX_NAMES) {
    return `姓名寫法最多 ${String(IMPORT_AI_PARSE_MAX_NAMES)} 個`;
  }
  if (cleaned.some((n) => n.length > IMPORT_AI_PARSE_NAME_MAX_CHARS || /[\r\n]/u.test(n))) {
    return `每個寫法最多 ${String(IMPORT_AI_PARSE_NAME_MAX_CHARS)} 字、只能一行`;
  }
  return cleaned;
}

/**
 * 確認姓名（D28「送出條件」）：helper 回「需確認姓名」（本次頁面的姓名沒辨識出來）時才顯示。
 * 預填資料區既有 Profile 的姓名（profile.get），可修改、可加多個寫法（例如中文名與英文名）；
 * 按確認後才送 AI 整理。姓名只用於本機遮蔽與預填，不送模型。
 */
export function NameConfirm(props: {
  onConfirm: (names: string[]) => void;
  /** 使用者改過欄位：確認後的 AI 結果會蓋掉表單，要再按一次（與「用 AI 重新整理」相同） */
  confirmingRerun: boolean;
}) {
  const { onConfirm, confirmingRerun } = props;
  const bridge = useBridge();
  const id = useId();
  const [names, setNames] = useState<string[]>(['']);
  const [prefilled, setPrefilled] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void bridge.send({ op: 'profile.get', payload: {} }).then((response) => {
      const name = response.ok ? response.profile?.personalInfo['姓名']?.trim() : undefined;
      // 使用者已經開始打字就不蓋掉
      if (!live || !name) return;
      setNames((old) => {
        if (old.length !== 1 || old[0] !== '') return old;
        setPrefilled(true);
        return [name];
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const edit = (next: string[]) => {
    setProblem(null);
    setNames(next);
  };

  function confirm() {
    const checked = checkNames(names);
    if (typeof checked === 'string') setProblem(checked);
    else onConfirm(checked);
  }

  return (
    <div role="group" aria-label="確認姓名" className="import-warning import-names">
      <p>
        這次的頁面沒有辨識出姓名。為了在送給 AI
        前遮蔽你的姓名，請確認姓名（可加多個寫法，例如中文名與英文名）。
        姓名只在本機使用，不會送出。
      </p>
      {names.map((name, i) => {
        const n = String(i + 1);
        return (
          <p key={i} className="import-name-row">
            <label htmlFor={`${id}-${n}`}>姓名寫法 {n}</label>{' '}
            <input
              id={`${id}-${n}`}
              value={name}
              maxLength={IMPORT_AI_PARSE_NAME_MAX_CHARS}
              onChange={(e) => edit(names.map((old, j) => (j === i ? e.target.value : old)))}
            />
            {names.length > 1 && (
              <button
                type="button"
                className="import-btn import-btn-danger import-btn-small"
                aria-label={`刪除姓名寫法 ${n}`}
                onClick={() => edit(names.filter((_, j) => j !== i))}
              >
                刪除
              </button>
            )}
          </p>
        );
      })}
      {problem && (
        <p role="alert" className="import-error">
          {problem}
        </p>
      )}
      <p className="import-actions">
        <button
          type="button"
          className="import-btn import-btn-secondary"
          disabled={names.length >= IMPORT_AI_PARSE_MAX_NAMES}
          onClick={() => edit([...names, ''])}
        >
          加一個寫法
        </button>
        <button type="button" className="import-btn import-btn-primary" onClick={confirm}>
          {confirmingRerun ? '確定重新整理（放棄目前的修改）' : '確認姓名並用 AI 整理'}
        </button>
      </p>
      {confirmingRerun && (
        <p role="note" aria-label="覆蓋提醒" className="import-hint">
          你已修改過欄位，用 AI 整理會蓋掉目前的內容。
        </p>
      )}
      {prefilled && <p className="import-hint">預填的是目前個人資料裡的姓名，請確認是否正確。</p>}
    </div>
  );
}
