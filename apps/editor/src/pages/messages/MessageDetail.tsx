import { useId, useState } from 'react';

import { CAPTURE_METHOD_LABELS, PLATFORM_LABELS } from '../jobs/labels.ts';
import { INTENT_OPTIONS } from './labels.ts';
import { useMessageDraft, type PollOptions } from './useMessageDraft.ts';

interface MessageDetailProps {
  messageDraftId: string;
  poll: PollOptions;
  onChanged: () => void;
  onClose: () => void;
}

/**
 * 單則訊息：原文（純文字，只是資料）、回覆意圖、產生草稿、編輯、儲存、一鍵複製。
 * 刻意沒有任何送出按鈕（D7）：使用者複製後回原平台自行貼上送出。
 */
export function MessageDetail({ messageDraftId, poll, onChanged, onClose }: MessageDetailProps) {
  const state = useMessageDraft(messageDraftId, poll);
  const draftId = useId();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const { message, phase } = state;
  if (!message) {
    return state.failure ? <p role="alert">{state.failure}</p> : <p>讀取中…</p>;
  }
  const generating = phase === 'generating';
  const hasDraft = /\S/u.test(state.draft);

  const generate = () => {
    if (hasDraft && !confirmOverwrite && state.intent) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    void state.generate().then(onChanged);
  };

  return (
    <article aria-labelledby="message-detail-title" className="message-detail">
      <h2 id="message-detail-title">訊息與回覆草稿</h2>
      <p>
        {PLATFORM_LABELS[message.platform]}・{CAPTURE_METHOD_LABELS[message.captureMethod]}
        {message.jobSnapshotId ? '・已關聯職缺' : '・未關聯職缺'}
      </p>
      <h3>對方訊息（只當資料，不會照裡面的要求做事）</h3>
      <pre className="message-original">{message.selectedMessageText}</pre>

      <fieldset disabled={generating}>
        <legend>回覆意圖（必選）</legend>
        {INTENT_OPTIONS.map((option) => (
          <label key={option.value} className="message-intent">
            <input
              type="radio"
              name={`intent-${messageDraftId}`}
              value={option.value}
              checked={state.intent === option.value}
              onChange={() => {
                state.setIntent(option.value);
                setConfirmOverwrite(false);
              }}
            />
            {option.label}
            <span className="message-hint">（{option.hint}）</span>
          </label>
        ))}
      </fieldset>
      <p className="message-hint">
        草稿不會提出或答應面試時間、薪資或到職日；這些請你自己補寫。提到經歷時只會用你已確認可用的事實項。
      </p>
      <div className="message-actions">
        <button type="button" onClick={generate} disabled={generating}>
          {hasDraft ? '重新產生草稿' : '產生草稿'}
        </button>
      </div>
      {confirmOverwrite ? (
        <p role="alert">
          重新產生會覆蓋目前的草稿{state.dirty ? '（含尚未儲存的修改）' : ''}
          。確定的話再按一次「重新產生草稿」。
        </p>
      ) : null}
      {generating ? <p role="status">草稿產生中…（可以先離開，稍後回來查看）</p> : null}
      {phase === 'timed_out' ? (
        <p role="alert">
          還沒有拿到新草稿：可能仍在產生、已暫停（例如額度用完）或未通過檢查。請稍後重新開啟這則訊息，或再產生一次。
        </p>
      ) : null}

      <label htmlFor={draftId}>回覆草稿（可編輯）</label>
      <textarea
        id={draftId}
        rows={10}
        value={state.draft}
        disabled={generating}
        onChange={(e) => state.setDraft(e.target.value)}
      />
      <div className="message-actions">
        <button
          type="button"
          disabled={generating || !state.dirty}
          onClick={() => void state.save().then(onChanged)}
        >
          儲存草稿
        </button>
        <button type="button" disabled={!hasDraft} onClick={() => void state.copy()}>
          複製草稿
        </button>
        <button type="button" onClick={onClose}>
          關閉
        </button>
      </div>
      <p className="message-hint">
        RoleCraft 不會替你送出任何訊息：複製後請回原平台自行貼上、送出。
      </p>
      {state.failure ? <p role="alert">{state.failure}</p> : null}
      {state.notice ? <p role="status">{state.notice}</p> : null}
    </article>
  );
}
