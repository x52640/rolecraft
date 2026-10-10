import { formatTime } from './labels.ts';

/** 確認狀態：確認後才能用於生成（R10）。 */
export function ConfirmationStatus({ confirmedAt }: { confirmedAt: string | null }) {
  return confirmedAt ? (
    <p className="job-confirmed" data-testid="confirmation">
      已確認（{formatTime(confirmedAt)}），可用於產生履歷。
    </p>
  ) : (
    <p className="job-unconfirmed" data-testid="confirmation">
      尚未確認：確認前不能用於產生履歷。
    </p>
  );
}
