import type { BridgeFailure } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../../bridge/BridgeProvider.tsx';
import { readCopyContext, useCopyContext } from './copy-context.ts';
import { COPY_TEXT, copyBlockReason, firstProblem, type SectionGate } from './copy-rules.ts';

type Outcome = { ok: true; text: string } | { ok: false; message: string };
const failed = (res: BridgeFailure): Outcome => ({
  ok: false,
  message: `${COPY_TEXT.failed}${res.error.message}`,
});

/**
 * 一段客製履歷的「複製」（P1-T086、resume-output「內容回填到求職網站」）。
 * 按下時向 helper 重新讀取版本、重跑 resume.check_export、再讀一次版本：
 * 兩次讀到的這段完全相同、文字等於畫面、已接受，且檢查結果中這段沒有任何問題或 blocker，才寫入剪貼簿。
 * 請求進行中鎖住按鈕；回應回來時卡片已卸載、版本已切換、畫面上的這段已更新，或頁面有寫入進行中，一律作廢。
 */
export function useSectionCopy(gate: SectionGate, busy: boolean) {
  const bridge = useBridge();
  const context = useCopyContext();
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef({ gate, busy });
  latest.current = { gate, busy };
  const op = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      op.current += 1;
    };
  }, []);

  const reason = context?.checked === true ? copyBlockReason(gate) : COPY_TEXT.noCheck;

  async function recheck(versionId: string, sectionId: string, shown: string): Promise<Outcome> {
    const payload = { resumeVersionId: versionId };
    const first = await bridge.send({ op: 'resume.get', payload });
    if (!first.ok) return failed(first);
    const check = await bridge.send({ op: 'resume.check_export', payload });
    if (!check.ok) return failed(check);
    const second = await bridge.send({ op: 'resume.get', payload });
    if (!second.ok) return failed(second);
    const before = first.version.sections.find((s) => s.id === sectionId);
    const after = second.version.sections.find((s) => s.id === sectionId);
    if (!before || !after) return { ok: false, message: COPY_TEXT.missing };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return { ok: false, message: COPY_TEXT.changed };
    }
    if (after.text !== shown) return { ok: false, message: COPY_TEXT.mismatch };
    const problem = firstProblem(sectionId, check.issues, check.blockers);
    const local = copyBlockReason({ section: after, issues: [], blockers: [] });
    if (problem !== null || local !== null) {
      return { ok: false, message: `${COPY_TEXT.recheck}${problem ?? local ?? ''}` };
    }
    return { ok: true, text: after.text };
  }

  async function copy() {
    if (copying || busy || reason !== null || context === null) return;
    const token = ++op.current;
    const { versionId } = context;
    const shown = gate.section;
    const shownJson = JSON.stringify(shown);
    const current = () =>
      alive.current &&
      op.current === token &&
      readCopyContext()?.versionId === versionId &&
      JSON.stringify(latest.current.gate.section) === shownJson &&
      !latest.current.busy;
    setCopying(true);
    setMessage(null);
    try {
      const outcome = await recheck(versionId, shown.id, shown.text);
      if (!current()) {
        if (alive.current && op.current === token) setMessage(COPY_TEXT.stale);
        return;
      }
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(outcome.text);
        if (alive.current) setMessage(COPY_TEXT.done);
      } catch {
        if (alive.current) setMessage(COPY_TEXT.clipboard);
      }
    } finally {
      if (alive.current && op.current === token) setCopying(false);
    }
  }

  return { reason, copying, message, copy };
}
