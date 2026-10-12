import type { IntroCitedClaim } from '@rolecraft/contracts';

import {
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  STATED_COMPLETION_LABELS,
} from './intro-labels.ts';

/**
 * 引用對照（R1）：自介沒有逐段對照畫面，措辭與宣稱的完成程度由使用者在這裡把關——
 * 每個引用的事實項內容（純文字，只是資料）、目前狀態，以及自介把它寫成的完成程度。
 */
export function IntroCitations({ citations }: { citations: readonly IntroCitedClaim[] }) {
  if (citations.length === 0) return null;
  return (
    <section aria-labelledby="intro-citations-title">
      <h4 id="intro-citations-title">引用的事實項（複製前請對照措辭）</h4>
      <table className="job-intro-citations">
        <thead>
          <tr>
            <th scope="col">事實項</th>
            <th scope="col">類型／目前狀態</th>
            <th scope="col">自介寫成</th>
          </tr>
        </thead>
        <tbody>
          {citations.map((c) => (
            <tr key={c.claimId} data-testid="intro-citation">
              <td>{c.text ?? '（事實項已不存在）'}</td>
              <td>
                {c.type ? CLAIM_TYPE_LABELS[c.type] : '—'}
                {c.completionStatus ? `／${CLAIM_STATUS_LABELS[c.completionStatus]}` : ''}
                {c.usable ? '' : '（目前不能使用）'}
              </td>
              <td>{c.statedCompletion ? STATED_COMPLETION_LABELS[c.statedCompletion] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
