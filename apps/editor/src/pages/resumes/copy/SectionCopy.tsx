import type { SectionGate } from './copy-rules.ts';
import { useSectionCopy } from './useSectionCopy.ts';

/** 段落的「複製」按鈕與原因說明（P1-T086）；不能複製時停用並顯示原因。 */
export function SectionCopy({ gate, busy }: { gate: SectionGate; busy: boolean }) {
  const { reason, copying, message, copy } = useSectionCopy(gate, busy);
  return (
    <>
      <button
        type="button"
        disabled={busy || copying || reason !== null}
        onClick={() => void copy()}
      >
        {copying ? '檢查中…' : '複製這段'}
      </button>
      {reason !== null ? <span className="resume-hint">{reason}</span> : null}
      {message !== null ? (
        <span role="status" className="resume-hint">
          {message}
        </span>
      ) : null}
    </>
  );
}
