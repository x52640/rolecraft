import {
  CHECK_TEXT,
  formatTime,
  isFirstVersionSupported,
  SERVICE_NAMES,
  type ServiceStatus,
  STATE_TEXT,
} from './labels.ts';
import { ModelPicker } from './ModelPicker.tsx';

interface ProviderCardProps {
  status: ServiceStatus;
  busy: boolean;
  onRecheck: () => void;
  onSettled: () => void;
}

/** 單一服務的狀態卡：狀態、各項檢查、下一步；可用時才顯示模型選擇。 */
export function ProviderCard({ status, busy, onRecheck, onSettled }: ProviderCardProps) {
  const name = SERVICE_NAMES[status.service];
  const text = STATE_TEXT[status.state];
  const supported = isFirstVersionSupported(status.service);
  const headingId = `provider-${status.service}`;
  return (
    <article className="provider-card" aria-labelledby={headingId} data-state={status.state}>
      <h2 id={headingId}>{name}</h2>
      <p>
        狀態：<strong>{text.label}</strong>
      </p>
      <p className="hint">{supported ? text.hint : '首版尚未支援這個服務，不會檢查也不會使用。'}</p>
      {supported ? (
        <>
          <dl className="checks">
            <dt>訂閱登入</dt>
            <dd>{CHECK_TEXT[status.login]}</dd>
            <dt>方案資格</dt>
            <dd>{CHECK_TEXT[status.eligibility]}</dd>
            <dt>只走訂閱、不額外收費</dt>
            <dd>{CHECK_TEXT[status.subscriptionOnly]}</dd>
            <dt>最近檢查</dt>
            <dd>{formatTime(status.checkedAt)}</dd>
          </dl>
          <button type="button" onClick={onRecheck} disabled={busy}>
            {busy ? '檢查中…' : '重新檢查'}
          </button>
          {status.state === 'available' ? (
            <ModelPicker
              service={status.service}
              selectedCandidateId={status.selectedCandidateId}
              onSettled={onSettled}
            />
          ) : null}
        </>
      ) : null}
    </article>
  );
}
