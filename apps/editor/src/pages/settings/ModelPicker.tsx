import type { CheckOutcome, Provider } from '@rolecraft/contracts';
import { useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { type ServiceCandidate, VERIFY_TEXT } from './labels.ts';

interface ModelPickerProps {
  service: Provider;
  selectedCandidateId: string | null;
  /** 選定結束（任何結果）後讓頁面重新讀狀態 */
  onSettled: () => void;
}

/**
 * 模型選擇：候選由 helper 列出（ID 是 helper 配發的），只能從清單挑，不能自行輸入模型名稱。
 * 選定時 helper 會先做執行前確認，再用訂閱做一次極短呼叫驗證。
 */
export function ModelPicker({ service, selectedCandidateId, onSettled }: ModelPickerProps) {
  const bridge = useBridge();
  const [candidates, setCandidates] = useState<readonly ServiceCandidate[] | null>(null);
  const [choice, setChoice] = useState<string>(selectedCandidateId ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void bridge.send({ op: 'providers.list_candidates', payload: { service } }).then((res) => {
      if (!alive) return;
      if (res.ok) setCandidates(res.candidates);
      else setMessage(`無法取得模型清單：${res.error.message}`);
    });
    return () => {
      alive = false;
    };
  }, [bridge, service]);

  const select = async () => {
    if (!choice) return;
    setBusy(true);
    setMessage(null);
    const res = await bridge.send({
      op: 'providers.select_candidate',
      payload: { service, candidateId: choice },
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(`無法選定：${res.error.message}`);
      onSettled();
      return;
    }
    const outcome: CheckOutcome = res.verification;
    setMessage(VERIFY_TEXT[outcome]);
    // 不論結果都重新讀狀態：被擋下時 helper 已把服務降為不可用，畫面不能留著舊的「可用」。
    onSettled();
  };

  if (candidates === null) return message ? <p role="alert">{message}</p> : <p>讀取模型清單中…</p>;
  if (candidates.length === 0) return <p>這個服務目前沒有可選的模型。</p>;

  const label = (id: string | null) => candidates.find((c) => c.candidateId === id)?.label;
  return (
    <fieldset className="model-picker">
      <legend>模型</legend>
      <p>目前使用：{label(selectedCandidateId) ?? '尚未選定'}</p>
      <label>
        選擇模型{' '}
        <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
          <option value="">請選擇</option>
          {candidates.map((c) => (
            <option key={c.candidateId} value={c.candidateId}>
              {c.label}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" onClick={() => void select()} disabled={busy || !choice}>
        {busy ? '驗證中…' : '選定並驗證'}
      </button>
      <p className="hint">驗證會用你的訂閱做一次極短呼叫，確認這個模型帳號可用。</p>
      {message ? <p role="status">{message}</p> : null}
    </fieldset>
  );
}
