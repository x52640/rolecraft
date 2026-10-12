import type { BridgeFailure } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import type { ResponseOf } from '../../bridge/client.ts';

export type VersionList = Extract<ResponseOf<'resume.list'>, { ok: true }>['versions'];

export interface ResumePollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍沒有新版本就停止並提示 */
  readonly maxPolls: number;
}

/** 履歷生成比自介長：每 3 秒看一次，最多約 5 分鐘。 */
export const DEFAULT_RESUME_POLL: ResumePollOptions = { intervalMs: 3000, maxPolls: 100 };

/**
 * 等待中的提示：沒有工作狀態的橋接操作，看不出背景是否還在跑（可能已暫停或失敗），
 * 所以只說「在等新版本」，不斷言「正在產生」。
 */
export const WAITING_TEXT =
  '已送出產生要求，正在等新版本出現（最多約 5 分鐘），出現後會自動顯示。等待期間可以照常操作，或按「停止等待」。';
export const GENERATED_TEXT = '已產生新版本並自動顯示。生成的段落都要逐段把關。';
export const STILL_RUNNING_TEXT =
  '等了一段時間還沒有新版本：可能還在產生，或沒有產生成功。稍後按「重新整理」查看。';
export const STOPPED_TEXT = '已停止等待。之後可以按「重新整理」查看有沒有新版本。';

/** sending：送出請求中（鎖頁面）；waiting：等新版本出現（不鎖，可停止等待）。 */
type Phase = 'sending' | 'waiting' | null;

interface Callbacks {
  /** 送出請求期間（列版本、送出產生）鎖住頁面操作；等待新版本期間不鎖 */
  readonly setBusy: (busy: boolean) => void;
  readonly setNotice: (text: string | null) => void;
  /** 出現新版本：換成新的版本清單並（視情況）選到新版本 */
  readonly onNewVersion: (versions: VersionList, versionId: string) => void;
}

const errorOf = (failure: BridgeFailure) => failure.error.message;

/**
 * 產生客製履歷並輪詢版本清單（沒有工作狀態的橋接操作，所以以「出現送出前沒有的版本」判定完成）。
 * 照投遞自介的做法：每次操作有自己的 token，切換職缺、停止等待、離開頁面都讓舊輪詢作廢。
 * 只有送出請求的短暫期間鎖住頁面；等待新版本期間頁面照常可用（對抗驗證：背景失敗時不能鎖 5 分鐘）。
 */
export function useGenerateResume(poll: ResumePollOptions, callbacks: Callbacks) {
  const bridge = useBridge();
  const [phase, setPhaseState] = useState<Phase>(null);
  const phaseRef = useRef<Phase>(null);
  const opRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const setPhase = (next: Phase) => {
    if (phaseRef.current === 'sending' && next !== 'sending') cb.current.setBusy(false);
    if (next === 'sending') cb.current.setBusy(true);
    phaseRef.current = next;
    setPhaseState(next);
  };
  const current = (token: number) => !disposed.current && opRef.current === token;
  const end = (token: number) => {
    if (current(token)) setPhase(null);
  };
  /** 作廢進行中的生成與輪詢（切換職缺、停止等待），並解除它造成的鎖定。 */
  const cancel = () => {
    opRef.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (phaseRef.current !== null) setPhase(null);
  };

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const waitForVersion = (
    jobSnapshotId: string,
    known: ReadonlySet<string>,
    remaining: number,
    token: number,
  ) => {
    timer.current = setTimeout(() => {
      void bridge.send({ op: 'resume.list', payload: { jobSnapshotId } }).then((res) => {
        if (!current(token)) return;
        const fresh = res.ok ? res.versions.find((v) => !known.has(v.resumeVersionId)) : undefined;
        if (res.ok && fresh) {
          cb.current.setNotice(GENERATED_TEXT);
          cb.current.onNewVersion(res.versions, fresh.resumeVersionId);
        } else if (remaining > 1) {
          waitForVersion(jobSnapshotId, known, remaining - 1, token);
          return;
        } else {
          cb.current.setNotice(STILL_RUNNING_TEXT);
        }
        end(token);
      });
    }, poll.intervalMs);
  };

  async function generate(jobSnapshotId: string) {
    if (phaseRef.current !== null) return;
    const token = ++opRef.current;
    setPhase('sending');
    cb.current.setNotice(null);
    // 送出前的版本清單：之後出現不在其中的版本，就是這次產生的
    const before = await bridge.send({ op: 'resume.list', payload: { jobSnapshotId } });
    if (!current(token)) return;
    if (!before.ok) {
      cb.current.setNotice(errorOf(before));
      end(token);
      return;
    }
    const known = new Set(before.versions.map((v) => v.resumeVersionId));
    const res = await bridge.send({ op: 'resume.generate', payload: { jobSnapshotId } });
    if (!current(token)) return;
    if (!res.ok) {
      cb.current.setNotice(errorOf(res));
      end(token);
      return;
    }
    setPhase('waiting');
    cb.current.setNotice(WAITING_TEXT);
    waitForVersion(jobSnapshotId, known, poll.maxPolls, token);
  }

  /** 使用者按「停止等待」。 */
  const stop = () => {
    if (phaseRef.current !== 'waiting') return;
    cancel();
    cb.current.setNotice(STOPPED_TEXT);
  };

  return { sending: phase === 'sending', waiting: phase === 'waiting', generate, stop, cancel };
}
