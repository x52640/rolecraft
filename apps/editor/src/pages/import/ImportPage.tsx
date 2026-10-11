import type { BridgeFailure, ImportResult } from '@rolecraft/contracts';
import { useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import {
  emptyForm,
  FAILURE_TEXT,
  formFromDraft,
  toProfileInput,
  type ProfileForm,
} from './form-model.ts';
import { ParsePreview } from './ParsePreview.tsx';
import { ProfileFormFields } from './ProfileForm.tsx';

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; what: string }
  | { kind: 'review'; importId: string; result: ImportResult }
  | { kind: 'confirmed'; profileId: string; displayName: string };

const failureText = (failure: BridgeFailure): string =>
  failure.error.code === 'helper_unavailable'
    ? '連不到本機輔助程式，請確認已安裝並啟動。'
    : failure.error.message;

/**
 * 履歷 PDF 匯入（F02、R10、D18）：選檔 → 預覽原文與欄位草稿 → 逐欄校正 → 確認後才寫入個人資料。
 * 檔案由本機輔助程式開系統選取器選（R7）；解析失敗清楚提示並改手動輸入。
 */
export function ImportPage() {
  const bridge = useBridge();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [checked, setChecked] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    setForm(got.result.status === 'parsed' ? formFromDraft(got.result.draft) : emptyForm());
    setChecked(false);
    setProblems([]);
    setPhase({ kind: 'review', importId, result: got.result });
  }

  function fail(message: string, next: Phase) {
    setError(message);
    setPhase(next);
  }

  function changeForm(next: ProfileForm) {
    setForm(next);
    // 內容改了就要重新核對。
    setChecked(false);
  }

  // 擁有者裁定 #12（P1-T051）：不提供「暫存校正」；只有確認後才寫入，存入前離開就丟掉修改。
  async function submit(review: Extract<Phase, { kind: 'review' }>) {
    setError(null);
    const input = toProfileInput(form);
    if (!input.ok) return setProblems(input.problems);
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
    <section className="page">
      <h1>匯入</h1>
      <p>匯入既有履歷 PDF（例如 104 下載的履歷）。只在本機讀取 PDF 文字層。</p>
      <p role="note" className="placeholder-note">
        掃描檔（沒有文字層）的文字辨識尚未實作；遇到時請改用手動輸入。
      </p>

      {error && <p role="alert">{error}</p>}

      {phase.kind === 'busy' && <p role="status">{phase.what}</p>}

      {(phase.kind === 'idle' || phase.kind === 'confirmed') && (
        <>
          {phase.kind === 'confirmed' && (
            <p role="status">
              已確認並寫入個人資料（來源：{phase.displayName}）。之後產生履歷只會用已確認的內容。
            </p>
          )}
          <button type="button" onClick={() => void pick()}>
            {phase.kind === 'idle' ? '選擇履歷 PDF' : '再匯入一份'}
          </button>
        </>
      )}

      {phase.kind === 'review' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(phase);
          }}
        >
          <p>
            檔案：{phase.result.displayName}{' '}
            <button type="button" onClick={() => void pick()}>
              改選其他檔案
            </button>
          </p>
          {phase.result.status === 'failed' ? (
            <div role="alert" aria-label="解析失敗">
              <p>無法可靠解析這份 PDF：{FAILURE_TEXT[phase.result.reason]}</p>
              <p>解析結果不會被使用。請在下方手動輸入個人資料、經歷與技能。</p>
            </div>
          ) : (
            <ParsePreview result={phase.result} />
          )}

          <ProfileFormFields form={form} onChange={changeForm} />

          {problems.length > 0 && (
            <ul role="alert" aria-label="需要修正">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          <p role="note" aria-label="尚未存入提醒">
            存入前離開頁面，修改不會保留。
          </p>

          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            我已逐欄核對，以上內容正確
          </label>
          <button type="submit" disabled={!checked}>
            確認並寫入個人資料
          </button>
        </form>
      )}
    </section>
  );
}
