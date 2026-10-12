import { INTRO_MAX_CHARS, introLength, type IntroDraft } from '@rolecraft/contracts';
import { useId, useState } from 'react';

import { IntroCitations } from './IntroCitations.tsx';
import { DEFAULT_INTRO_POLL, INTRO_PROBLEM_LABELS, type IntroPollOptions } from './intro-labels.ts';
import { useIntro } from './useIntro.ts';

interface IntroPanelProps {
  jobSnapshotId: string;
  /** 快照是否已確認：未確認不能產生（R10） */
  confirmed: boolean;
  poll?: IntroPollOptions;
}

/** 草稿文字中標出問題片段的位置（片段取自檢查的正規化結果，對不上原文的就只列在清單裡）。 */
function MarkedDraft({ draft }: { draft: IntroDraft }) {
  const parts: (string | { mark: string })[] = [];
  let rest = draft.text;
  for (;;) {
    const hits = draft.fragments
      .filter((f) => f.length > 0)
      .map((f) => ({ f, at: rest.indexOf(f) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => a.at - b.at || b.f.length - a.f.length);
    const hit = hits[0];
    if (!hit) break;
    parts.push(rest.slice(0, hit.at), { mark: hit.f });
    rest = rest.slice(hit.at + hit.f.length);
  }
  parts.push(rest);
  return (
    <p className="job-intro-draft-text" data-testid="intro-draft-marked">
      {parts.map((p, i) => (typeof p === 'string' ? p : <mark key={i}>{p.mark}</mark>))}
    </p>
  );
}

/**
 * 投遞自介（D25）：產生 300 字內自介、字數、編輯、儲存（重跑檢查）、複製。
 * 沒通過檢查的模型輸出顯示成「未通過的草稿」（P1-T071）：標出問題與位置、可修改後儲存（通過才成為正式自介）
 * 或請 AI 修正一次；草稿沒有複製按鈕。
 * 刻意沒有任何送出或投遞按鈕（D7）：使用者複製後自行貼到求職網站。
 */
export function IntroPanel({
  jobSnapshotId,
  confirmed,
  poll = DEFAULT_INTRO_POLL,
}: IntroPanelProps) {
  const state = useIntro(jobSnapshotId, poll);
  const textId = useId();
  const draftId = useId();
  // 二次確認綁在觸發它的版本號：之後內容有任何變動（含儲存成功）就失效
  const [overwriteAt, setOverwriteAt] = useState<number | null>(null);
  const [reloadAt, setReloadAt] = useState<number | null>(null);
  const { intro, check, draft, version, box, draftBox } = state;
  const locked = state.busy !== null;
  const generating = state.busy === 'generating';
  const confirmOverwrite = overwriteAt === version;
  const unsaved = box.dirty || draftBox.dirty;
  const confirmReload = reloadAt === version && unsaved;
  const edited = (intro !== null && (intro.userEdited || box.dirty)) || draftBox.dirty;
  const length = introLength(box.text);
  const draftLength = introLength(draftBox.text);

  const generate = () => {
    if (edited && !confirmOverwrite) {
      setOverwriteAt(version);
      return;
    }
    setOverwriteAt(null);
    void state.generate();
  };

  /** 已儲存的內容在別處變了時，可重新載入；有未存修改要再按一次確認（也可選擇儲存保留本地修改）。 */
  const reload = () => {
    if (unsaved && !confirmReload) {
      setReloadAt(version);
      return;
    }
    setReloadAt(null);
    void state.reload();
  };

  const copyBlocked = box.dirty
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
        <button type="button" onClick={generate} disabled={locked || !confirmed}>
          {intro ? '重新產生投遞自介' : '產生投遞自介'}
        </button>
      </div>
      {confirmOverwrite ? (
        <p role="alert">
          重新產生會覆蓋你編輯過的自介{draftBox.dirty ? '並捨棄草稿上的修改' : ''}
          {box.dirty ? '（含尚未儲存的修改）' : ''}。確定的話再按一次「重新產生投遞自介」。
        </p>
      ) : null}
      {generating ? <p role="status">投遞自介產生中…（可以先離開，稍後回來查看）</p> : null}
      {draft ? (
        <section aria-labelledby="intro-draft-title" className="job-intro-draft">
          <h4 id="intro-draft-title">未通過檢查的草稿（不能複製）</h4>
          <p data-testid="intro-draft-problem">
            沒有通過檢查：{INTRO_PROBLEM_LABELS[draft.problem]}。這份草稿不是正式自介、不能複製；
            修改後按「儲存草稿並重新檢查」，通過才會成為正式自介。也可以按「請 AI 修正」把問題回饋給
            AI 重寫一次（會再用一次額度，不會自動重試）。
          </p>
          {draft.fragments.length > 0 ? (
            <p data-testid="intro-draft-fragments">
              問題片段：{draft.fragments.map((f) => `「${f}」`).join('、')}（下方標出位置）
            </p>
          ) : null}
          <MarkedDraft draft={draft} />
          <label htmlFor={draftId}>未通過的草稿（可編輯）</label>
          <textarea
            id={draftId}
            rows={6}
            value={draftBox.text}
            disabled={locked}
            onChange={(e) => state.setDraftText(e.target.value)}
          />
          <p className={draftLength > INTRO_MAX_CHARS ? 'job-field-error' : ''}>
            {draftLength}／{INTRO_MAX_CHARS} 字（含標點與空白）
          </p>
          <div className="job-actions">
            <button
              type="button"
              disabled={locked || !draftBox.dirty || box.dirty}
              onClick={() => void state.saveDraft()}
            >
              儲存草稿並重新檢查
            </button>
            <button
              type="button"
              disabled={locked || draftBox.dirty || box.dirty || !confirmed}
              onClick={() => void state.fix()}
            >
              請 AI 修正
            </button>
          </div>
          {box.dirty ? (
            <p>
              已存的自介有尚未儲存的修改：先儲存或重新載入，才能儲存草稿或請 AI
              修正（修正結果會取代已存的自介）。
            </p>
          ) : null}
          {draftBox.dirty ? <p>草稿有尚未儲存的修改：先儲存草稿，才能請 AI 修正。</p> : null}
        </section>
      ) : null}
      {intro ? (
        <>
          <label htmlFor={textId}>投遞自介（可編輯）</label>
          <textarea
            id={textId}
            rows={8}
            value={box.text}
            disabled={locked}
            onChange={(e) => state.setText(e.target.value)}
          />
          <p
            data-testid="intro-length"
            className={length > INTRO_MAX_CHARS ? 'job-field-error' : ''}
          >
            {length}／{INTRO_MAX_CHARS} 字（含標點與空白）
          </p>
          <div className="job-actions">
            <button type="button" disabled={locked || !box.dirty} onClick={() => void state.save()}>
              儲存修改
            </button>
            <button
              type="button"
              disabled={locked || copyBlocked !== null || check === null}
              onClick={() => void state.copy()}
            >
              複製自介
            </button>
            <button type="button" disabled={locked} onClick={reload}>
              重新載入已儲存內容
            </button>
          </div>
          {confirmReload ? (
            <p role="alert">
              重新載入會放棄你尚未儲存的修改；要保留就直接按「儲存修改」。確定放棄的話再按一次「重新載入已儲存內容」。
            </p>
          ) : null}
          {copyBlocked ? <p data-testid="copy-blocked">{copyBlocked}</p> : null}
          {!box.dirty && check?.warning ? (
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
