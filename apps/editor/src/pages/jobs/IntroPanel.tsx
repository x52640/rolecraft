import { INTRO_MAX_CHARS, introLength } from '@rolecraft/contracts';
import { useId, useState } from 'react';

import { IntroCitations } from './IntroCitations.tsx';
import { INTRO_PROBLEM_LABELS } from './intro-labels.ts';
import { DEFAULT_INTRO_POLL, useIntro, type IntroPollOptions } from './useIntro.ts';

interface IntroPanelProps {
  jobSnapshotId: string;
  /** 快照是否已確認：未確認不能產生（R10） */
  confirmed: boolean;
  poll?: IntroPollOptions;
}

/**
 * 投遞自介（D25）：產生 300 字內自介、字數、編輯、儲存（重跑檢查）、複製。
 * 刻意沒有任何送出或投遞按鈕（D7）：使用者複製後自行貼到求職網站。
 */
export function IntroPanel({
  jobSnapshotId,
  confirmed,
  poll = DEFAULT_INTRO_POLL,
}: IntroPanelProps) {
  const state = useIntro(jobSnapshotId, poll);
  const textId = useId();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const { intro, check, generating } = state;
  const edited = intro !== null && (intro.userEdited || state.dirty);
  const length = introLength(state.text);

  const generate = () => {
    if (edited && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    void state.generate();
  };

  const copyBlocked = state.dirty
    ? '有尚未儲存的修改：儲存後會重新檢查，通過才能複製。'
    : check?.problem
      ? `沒有通過檢查，不能複製：${INTRO_PROBLEM_LABELS[check.problem]}。請改寫或重新產生。`
      : null;

  return (
    <section aria-labelledby="intro-title" className="job-intro">
      <h3 id="intro-title">投遞自介</h3>
      <p className="job-hint">
        針對這個職缺產生 {INTRO_MAX_CHARS} 字內的簡短自介。只會用你可用的事實項與已確認的個人資料，
        不會承諾面試時間、薪資或到職日；RoleCraft 不會替你送出或投遞。
      </p>
      {!confirmed ? <p className="job-hint">請先確認快照，才能產生投遞自介。</p> : null}
      <div className="job-actions">
        <button type="button" onClick={generate} disabled={generating || !confirmed}>
          {intro ? '重新產生投遞自介' : '產生投遞自介'}
        </button>
      </div>
      {confirmOverwrite ? (
        <p role="alert">
          重新產生會覆蓋你編輯過的自介{state.dirty ? '（含尚未儲存的修改）' : ''}
          。確定的話再按一次「重新產生投遞自介」。
        </p>
      ) : null}
      {generating ? <p role="status">投遞自介產生中…（可以先離開，稍後回來查看）</p> : null}
      {intro ? (
        <>
          <label htmlFor={textId}>投遞自介（可編輯）</label>
          <textarea
            id={textId}
            rows={8}
            value={state.text}
            disabled={generating}
            onChange={(e) => state.setText(e.target.value)}
          />
          <p
            data-testid="intro-length"
            className={length > INTRO_MAX_CHARS ? 'job-field-error' : ''}
          >
            {length}／{INTRO_MAX_CHARS} 字（含標點與空白）
          </p>
          <div className="job-actions">
            <button
              type="button"
              disabled={generating || state.saving || !state.dirty}
              onClick={() => void state.save()}
            >
              儲存修改
            </button>
            <button
              type="button"
              disabled={generating || state.saving || copyBlocked !== null || check === null}
              onClick={() => void state.copy()}
            >
              複製自介
            </button>
          </div>
          {copyBlocked ? <p data-testid="copy-blocked">{copyBlocked}</p> : null}
          {!state.dirty && check?.warning ? (
            <p data-testid="intro-warning" className="job-hint">
              提示：{INTRO_PROBLEM_LABELS[check.warning]}
              。這是你自己加的內容，可以複製，但請確認不會被當成承諾。
            </p>
          ) : null}
          {check ? <IntroCitations citations={check.citations} /> : null}
        </>
      ) : null}
      {state.failure ? <p role="alert">{state.failure}</p> : null}
      {state.notice ? <p role="status">{state.notice}</p> : null}
    </section>
  );
}
