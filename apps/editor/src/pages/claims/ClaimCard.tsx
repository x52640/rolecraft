import type { Claim, ConfirmableCompletion } from '@rolecraft/contracts';
import { useState } from 'react';

import { ClaimSources } from './ClaimSources.tsx';
import {
  COMPLETION_LABELS,
  REVIEW_LABELS,
  TYPE_LABELS,
  formatTime,
  isConfirmationCurrent,
  needsCompletion,
} from './labels.ts';

/** 完成狀態選擇：空字串＝尚未選（不預設任何值，避免順手確認成「完成」）。 */
export type CompletionChoice = ConfirmableCompletion | '';

export interface ClaimCardProps {
  claim: Claim;
  busy: boolean;
  completionChoice: CompletionChoice;
  onCompletionChange: (choice: CompletionChoice) => void;
  /** 只有複核狀態正常的事實項能加入批次；其他要逐項對照原文確認。 */
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
  onConfirm: () => void;
  /** 回傳是否存檔成功；失敗時保留編輯框與草稿，讓使用者修正後再存。 */
  onUpdate: (text: string) => Promise<boolean>;
  onReject: () => void;
}

function ConfirmationNote({ claim }: { claim: Claim }) {
  const confirmation = claim.basis.userConfirmation;
  if (confirmation === null) return <p className="claim-unconfirmed">尚未經你確認。</p>;
  if (!isConfirmationCurrent(claim)) {
    return <p className="claim-unconfirmed">確認後內容已改變，需要重新確認。</p>;
  }
  return (
    <p className="claim-confirmed">你已於 {formatTime(confirmation.confirmedAt)} 確認此內容。</p>
  );
}

export function ClaimCard(props: ClaimCardProps) {
  const { claim, busy } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(claim.text);
  const [askingDelete, setAskingDelete] = useState(false);
  const withCompletion = needsCompletion(claim);
  const canConfirm = !busy && (!withCompletion || props.completionChoice !== '');
  const batchable = claim.reviewStatus === 'normal';
  const titleId = `claim-${claim.id}`;

  return (
    <article className="claim-card" aria-labelledby={titleId}>
      <div className="claim-main">
        <p className="claim-type">{TYPE_LABELS[claim.type]}</p>
        <p id={titleId} className="claim-text">
          {claim.text}
        </p>
        {claim.completionStatus === undefined ? null : (
          <p>完成狀態：{COMPLETION_LABELS[claim.completionStatus]}</p>
        )}
        {claim.reviewStatus === 'normal' ? null : (
          <p role="status" className="claim-review">
            {REVIEW_LABELS[claim.reviewStatus]}
          </p>
        )}
        <ConfirmationNote claim={claim} />

        {editing ? (
          <div className="claim-edit">
            <label>
              修改內容
              {/* 存檔中停用：成功後會關閉編輯框，期間多打的字會消失 */}
              <textarea
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
            </label>
            <p className="claim-hint">儲存後原本的確認會失效、改為待複核，需要對照原文重新確認。</p>
            <button
              type="button"
              disabled={busy || draft.trim() === ''}
              onClick={() => {
                void props.onUpdate(draft).then((ok) => {
                  if (ok) setEditing(false);
                });
              }}
            >
              儲存修改
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        ) : (
          <div className="claim-actions">
            {withCompletion ? (
              <label>
                確認為
                <select
                  value={props.completionChoice}
                  onChange={(e) => props.onCompletionChange(e.target.value as CompletionChoice)}
                >
                  <option value="">請選擇</option>
                  <option value="user_confirmed_done">已完成</option>
                  <option value="planned">計畫中</option>
                </select>
              </label>
            ) : null}
            <button type="button" disabled={!canConfirm} onClick={props.onConfirm}>
              確認此項
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(claim.text);
                setEditing(true);
              }}
            >
              修改
            </button>
            {askingDelete ? (
              <span role="group" aria-label="確認刪除">
                刪除後不會再用於生成；引用它且尚未投遞的匯出版本會一併刪除，已投遞的匯出版本會保留（含此事實項的副本）。
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAskingDelete(false);
                    props.onReject();
                  }}
                >
                  確定刪除
                </button>
                <button type="button" onClick={() => setAskingDelete(false)}>
                  不刪除
                </button>
              </span>
            ) : (
              <button type="button" disabled={busy} onClick={() => setAskingDelete(true)}>
                刪除
              </button>
            )}
            <label className="claim-batch">
              <input
                type="checkbox"
                checked={batchable && props.selected}
                disabled={!batchable || busy}
                onChange={(e) => props.onSelectChange(e.target.checked)}
              />
              加入批次確認
            </label>
          </div>
        )}
      </div>
      <div className="claim-side">
        <ClaimSources claim={claim} />
      </div>
    </article>
  );
}
