import type { BridgeFailure, ImportResult } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { helperUnavailableText } from '../../bridge/helper-busy.ts';
import { emptyForm, formFromDraft, toProfileInput, type ProfileForm } from './form-model.ts';
import { formFromAiDraft, rulesSource, type PrefillSource } from './ai-form.ts';
import { LatestCapturePanel } from './components/LatestCapturePanel.tsx';
import { ImportReview } from './ImportReview.tsx';
import { DEFAULT_AI_POLL, useAiParse, type AiPollOptions, type AiSession } from './useAiParse.ts';
import { useLatestCapture } from './useLatestCapture.ts';

import './import.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'review'; importId: string; result: ImportResult }
  | { kind: 'confirmed'; displayName: string };

const MULTIPLE_PROFILES_TEXT =
  '資料區已有多份個人資料（舊資料），為了不覆蓋錯的那份，這次沒有寫入。請先整理資料區只留一份再確認。';

const failureText = (failure: BridgeFailure): string => {
  if (failure.error.code === 'helper_unavailable') {
    return helperUnavailableText(failure, '連不到本機輔助程式，請確認已安裝並啟動。');
  }
  if (failure.error.reason === 'multiple_profiles') return MULTIPLE_PROFILES_TEXT;
  return failure.error.message;
};

/**
 * 履歷匯入（F02、R10、D18；D28 加網頁擷取與手動輸入）：開啟一份來源 → 核對原文與欄位草稿 → 逐欄校正
 * → 確認後才寫入（取代目前那份個人資料）。
 * - 網頁擷取：顯示最近一次擷取，按「使用這份」才開啟核對；一律按「用 AI 整理」才呼叫模型（Q4＝B），
 *   擷取送達、查詢、開啟、切換都不會觸發。
 * - PDF：檔案由本機輔助程式開系統選取器選（R7）；104 版面按鈕才整理，其他格式自動整理（P1-T069）。
 * - 手動輸入一律提供（import.start_manual）。
 */
export function ImportPage({ aiPoll = DEFAULT_AI_POLL }: { aiPoll?: AiPollOptions }) {
  const bridge = useBridge();
  const latest = useLatestCapture();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [checked, setChecked] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 每次送出驗證失敗加一：把錯誤清單捲進畫面並聚焦（確認列在視窗底部，清單可能在畫面外）。
  const [failedAttempts, setFailedAttempts] = useState(0);
  const problemsRef = useRef<HTMLUListElement>(null);
  const sessionKey = useRef(0);
  const [aiSession, setAiSession] = useState<AiSession | null>(null);
  const [source, setSource] = useState<PrefillSource>('manual');
  const [edited, setEdited] = useState(false);
  const [rerunArmed, setRerunArmed] = useState(false);
  // 使用者確認過的姓名（網頁來源 helper 回「需確認姓名」後才有）；重新整理時一併帶上
  const [names, setNames] = useState<string[] | undefined>(undefined);
  const ai = useAiParse(aiSession, aiPoll, (draft) => {
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

  /** 開啟一次核對。只有 PDF 非 104 版面會自動 AI 整理；網頁、手動、解析失敗都不會。 */
  function open(importId: string, result: ImportResult) {
    const parsed = result.status === 'parsed' ? result : null;
    setForm(parsed ? formFromDraft(parsed.draft) : emptyForm());
    setSource(parsed ? rulesSource(parsed.draft) : 'manual');
    setEdited(false);
    setRerunArmed(false);
    setChecked(false);
    setProblems([]);
    setNames(undefined);
    setPhase({ kind: 'review', importId, result });
    sessionKey.current += 1;
    const key = sessionKey.current;
    if (parsed) setAiSession({ key, importId, auto: parsed.draft.structured === undefined });
    else if (result.status === 'web_capture') setAiSession({ key, importId, auto: false });
    else setAiSession(null);
  }

  async function load(importId: string, previous: Phase) {
    const got = await bridge.send({ op: 'import.get', payload: { importId } });
    if (!got.ok) return fail(failureText(got), previous);
    open(importId, got.result);
  }

  async function pick() {
    setError(null);
    // 取消或失敗時回到原畫面（例如在核對畫面按「改選其他檔案」），不清掉進行中的核對。
    const previous = phase;
    setPhase({ kind: 'busy', what: '等待選擇檔案…' });
    const picked = await bridge.send({ op: 'import.pick_pdf', payload: {} });
    if (!picked.ok) return fail(failureText(picked), previous);
    if (picked.selection.status === 'cancelled') return setPhase(previous);
    setPhase({ kind: 'busy', what: '讀取解析結果…' });
    await load(picked.selection.importId, previous);
  }

  /** 「使用這份」：只開啟核對（import.get），不送 AI。 */
  async function openCapture(importId: string) {
    setError(null);
    const previous = phase;
    setPhase({ kind: 'busy', what: '讀取擷取內容…' });
    await load(importId, previous);
  }

  async function startManual() {
    setError(null);
    const previous = phase;
    setPhase({ kind: 'busy', what: '建立手動輸入…' });
    const started = await bridge.send({ op: 'import.start_manual', payload: {} });
    if (!started.ok) return fail(failureText(started), previous);
    open(started.importId, { status: 'manual', displayName: '手動輸入' });
  }

  function fail(message: string, next: Phase) {
    setError(message);
    setPhase(next);
  }

  function changeForm(next: ProfileForm) {
    if (ai.running) return; // AI 整理中鎖住表單
    setForm(next);
    // 內容改了就要重新核對；用 AI 整理（會覆蓋）前要再確認一次。
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
    ai.restart(names);
  }

  // 確認姓名也會用 AI 結果覆蓋表單：改過欄位就和「用 AI 重新整理」一樣要再按一次（codex 審查）。
  // 姓名先記住，第二次按時送的是使用者當下確認的寫法。
  function confirmNames(list: string[]) {
    setNames(list);
    if (edited && !rerunArmed) {
      setRerunArmed(true);
      return;
    }
    setRerunArmed(false);
    ai.restart(list);
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
    setPhase({ kind: 'confirmed', displayName: review.result.displayName });
  }

  const busy = phase.kind === 'busy' || ai.running;
  return (
    <section className="page import-page">
      <header className="import-header">
        <h1>匯入</h1>
        <p className="import-hint">
          在求職網站的履歷頁點 RoleCraft 圖示擷取後，在這裡核對；也可以匯入履歷
          PDF（只在本機讀取文字層， 掃描檔請改用手動輸入），或直接手動輸入。
        </p>
      </header>

      <LatestCapturePanel
        state={latest.state}
        onUse={(importId) => void openCapture(importId)}
        onRefresh={latest.refresh}
        disabled={busy}
      />

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
          <p className="import-actions">
            <button
              type="button"
              className="import-btn import-btn-primary"
              onClick={() => void pick()}
            >
              {phase.kind === 'idle' ? '選擇履歷 PDF' : '再匯入一份'}
            </button>
            <button
              type="button"
              className="import-btn import-btn-secondary"
              onClick={() => void startManual()}
            >
              手動輸入
            </button>
          </p>
        </div>
      )}

      {phase.kind === 'review' && (
        <ImportReview
          result={phase.result}
          form={form}
          onFormChange={changeForm}
          ai={ai}
          source={source}
          rerunArmed={rerunArmed}
          onRerun={rerun}
          onConfirmNames={confirmNames}
          problems={problems}
          problemsRef={problemsRef}
          checked={checked}
          onCheck={setChecked}
          onSubmit={() => void submit(phase)}
          onPick={() => void pick()}
          onManual={() => void startManual()}
        />
      )}
    </section>
  );
}
