import type { BridgeFailure, ImportResult } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { helperUnavailableText } from '../../bridge/helper-busy.ts';
import {
  emptyForm,
  FAILURE_TEXT,
  formFromDraft,
  toProfileInput,
  type ProfileForm,
} from './form-model.ts';
import { formFromAiDraft, rulesSource, type PrefillSource } from './ai-form.ts';
import { AiParsePanel } from './components/AiParsePanel.tsx';
import { ConfirmBar } from './components/ConfirmBar.tsx';
import { ParsePreview } from './ParsePreview.tsx';
import { ProfileFormFields } from './ProfileForm.tsx';
import { DEFAULT_AI_POLL, useAiParse, type AiPollOptions } from './useAiParse.ts';

import './import.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'review'; importId: string; result: ImportResult }
  | { kind: 'confirmed'; profileId: string; displayName: string };

const failureText = (failure: BridgeFailure): string =>
  failure.error.code === 'helper_unavailable'
    ? helperUnavailableText(failure, '連不到本機輔助程式，請確認已安裝並啟動。')
    : failure.error.message;

/**
 * 履歷 PDF 匯入（F02、R10、D18）：選檔 → 預覽原文與欄位草稿 → 逐欄校正 → 確認後才寫入個人資料。
 * 檔案由本機輔助程式開系統選取器選（R7）；解析失敗清楚提示並改手動輸入。
 * 解析成功後自動用 AI 整理（P1-T069）：整理中鎖住表單；成功時以逐欄對照過原文的結果預填，
 * 失敗或不可用時保留規則（104 版面或通用）的預填並標明來源。
 */
export function ImportPage({ aiPoll = DEFAULT_AI_POLL }: { aiPoll?: AiPollOptions }) {
  const bridge = useBridge();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [checked, setChecked] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 每次送出驗證失敗加一：把錯誤清單捲進畫面並聚焦（確認列在視窗底部，清單可能在畫面外）。
  const [failedAttempts, setFailedAttempts] = useState(0);
  const problemsRef = useRef<HTMLUListElement>(null);
  // AI 整理（P1-T069）：只對解析成功的匯入自動開始；確認失敗回到核對畫面不會重跑
  const [aiImportId, setAiImportId] = useState<string | null>(null);
  const [source, setSource] = useState<PrefillSource>('manual');
  const [edited, setEdited] = useState(false);
  const [rerunArmed, setRerunArmed] = useState(false);
  const ai = useAiParse(aiImportId, aiPoll, (draft) => {
    setForm(formFromAiDraft(draft));
    setSource('ai');
    setEdited(false);
    setRerunArmed(false);
    setChecked(false);
    setProblems([]);
  });

  useEffect(() => {
    if (failedAttempts > 0) problemsRef.current?.focus();
  }, [failedAttempts]);

  async function pick() {
    setError(null);
    // 取消或失敗時回到原畫面（例如在核對畫面按「改選其他檔案」），不清掉進行中的核對。
    const previous = phase;
    setPhase({ kind: 'busy', what: '等待選擇檔案…' });
    const picked = await bridge.send({ op: 'import.pick_pdf', payload: {} });
    if (!picked.ok) return fail(failureText(picked), previous);
    if (picked.selection.status === 'cancelled') return setPhase(previous);
    const { importId } = picked.selection;
    setPhase({ kind: 'busy', what: '讀取解析結果…' });
    const got = await bridge.send({ op: 'import.get', payload: { importId } });
    if (!got.ok) return fail(failureText(got), previous);
    const parsed = got.result.status === 'parsed' ? got.result : null;
    setForm(parsed ? formFromDraft(parsed.draft) : emptyForm());
    setSource(parsed ? rulesSource(parsed.draft) : 'manual');
    setEdited(false);
    setRerunArmed(false);
    setChecked(false);
    setProblems([]);
    setPhase({ kind: 'review', importId, result: got.result });
    setAiImportId(parsed ? importId : null);
  }

  function fail(message: string, next: Phase) {
    setError(message);
    setPhase(next);
  }

  function changeForm(next: ProfileForm) {
    if (ai.running) return; // AI 整理中鎖住表單
    setForm(next);
    // 內容改了就要重新核對；重新用 AI 整理前要再確認一次。
    setChecked(false);
    setEdited(true);
    setRerunArmed(false);
  }

  function rerun() {
    if (edited && !rerunArmed) {
      setRerunArmed(true);
      return;
    }
    setRerunArmed(false);
    ai.restart();
  }

  // 擁有者裁定 #12（P1-T051）：不提供「暫存校正」；只有確認後才寫入，存入前離開就丟掉修改。
  async function submit(review: Extract<Phase, { kind: 'review' }>) {
    setError(null);
    if (ai.running) return;
    const input = toProfileInput(form);
    if (!input.ok) {
      setProblems(input.problems);
      setFailedAttempts((n) => n + 1);
      return;
    }
    setProblems([]);
    const payload = { importId: review.importId, profile: input.profile };
    setPhase({ kind: 'busy', what: '寫入個人資料…' });
    const done = await bridge.send({ op: 'import.confirm', payload });
    if (!done.ok) return fail(failureText(done), review);
    setPhase({
      kind: 'confirmed',
      profileId: done.profileId,
      displayName: review.result.displayName,
    });
  }

  return (
    <section className="page import-page">
      <header className="import-header">
        <h1>匯入</h1>
        <p className="import-hint">
          匯入既有履歷 PDF（例如 104 下載的履歷），只在本機讀取文字層。掃描檔的文字辨識尚未實作，
          遇到時請改用手動輸入。
        </p>
      </header>

      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}

      {phase.kind === 'busy' && (
        <p role="status" className="import-hint">
          {phase.what}
        </p>
      )}

      {(phase.kind === 'idle' || phase.kind === 'confirmed') && (
        <div className="import-start">
          {phase.kind === 'confirmed' && (
            <p role="status" className="import-success">
              已確認並寫入個人資料（來源：{phase.displayName}）。之後產生履歷只會用已確認的內容。
            </p>
          )}
          <button
            type="button"
            className="import-btn import-btn-primary"
            onClick={() => void pick()}
          >
            {phase.kind === 'idle' ? '選擇履歷 PDF' : '再匯入一份'}
          </button>
        </div>
      )}

      {phase.kind === 'review' && (
        <form
          className="import-review"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(phase);
          }}
        >
          <div className="import-file-bar">
            <span>
              檔案：<strong>{phase.result.displayName}</strong>
            </span>
            <button
              type="button"
              className="import-btn import-btn-secondary"
              onClick={() => void pick()}
            >
              改選其他檔案
            </button>
          </div>
          {phase.result.status === 'failed' && (
            <div role="alert" aria-label="解析失敗" className="import-warning">
              <p>無法可靠解析這份 PDF：{FAILURE_TEXT[phase.result.reason]}</p>
              <p>解析結果不會被使用。請在下方手動輸入個人資料、經歷與技能。</p>
            </div>
          )}

          <div className={phase.result.status === 'parsed' ? 'import-layout' : undefined}>
            <div className="import-form-column">
              {phase.result.status === 'parsed' && (
                <AiParsePanel
                  state={ai.state}
                  source={source}
                  confirmingRerun={rerunArmed}
                  onRerun={rerun}
                />
              )}
              <ProfileFormFields form={form} onChange={changeForm} disabled={ai.running} />
              {problems.length > 0 && (
                <ul
                  ref={problemsRef}
                  tabIndex={-1}
                  role="alert"
                  aria-label="需要修正"
                  className="import-error"
                >
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
            {phase.result.status === 'parsed' && <ParsePreview result={phase.result} />}
          </div>

          <ConfirmBar
            checked={checked}
            onCheck={setChecked}
            problemCount={problems.length}
            locked={ai.running}
          />
        </form>
      )}
    </section>
  );
}
