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

export const GENERATING_TEXT = '正在產生客製履歷，完成後會自動顯示新版本；產生期間先鎖住操作。';
export const GENERATED_TEXT = '已產生新版本並自動顯示。生成的段落都要逐段把關。';
export const STILL_RUNNING_TEXT =
  '等了一段時間還沒有新版本：可能還在產生，或沒有產生成功。稍後按「重新整理」查看。';

interface Callbacks {
  /** 請求進行中鎖住頁面操作 */
  readonly setBusy: (busy: boolean) => void;
  readonly setNotice: (text: string | null) => void;
  /** 出現新版本：換成新的版本清單並選到新版本 */
  readonly onNewVersion: (versions: VersionList, versionId: string) => void;
}

const errorOf = (failure: BridgeFailure) => failure.error.message;

/**
 * 產生客製履歷並輪詢版本清單（沒有工作狀態的橋接操作，所以以「出現送出前沒有的版本」判定完成）。
 * 照投遞自介的做法：每次操作有自己的 token，切換職缺、離開頁面或新的操作都讓舊輪詢作廢；
 * 進行中鎖住頁面（setBusy），結束才解鎖。
 */
export function useGenerateResume(poll: ResumePollOptions, callbacks: Callbacks) {
  const bridge = useBridge();
  const [generating, setGeneratingState] = useState(false);
  const generatingRef = useRef(false);
  const opRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const setGenerating = (next: boolean) => {
    generatingRef.current = next;
    setGeneratingState(next);
  };
  const current = (token: number) => !disposed.current && opRef.current === token;
  const end = (token: number) => {
    if (!current(token)) return;
    setGenerating(false);
    cb.current.setBusy(false);
  };
  /** 作廢進行中的生成與輪詢（切換職缺時），並解除它造成的鎖定。 */
  const cancel = () => {
    opRef.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!generatingRef.current) return;
    setGenerating(false);
    cb.current.setBusy(false);
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
          cb.current.onNewVersion(res.versions, fresh.resumeVersionId);
          cb.current.setNotice(GENERATED_TEXT);
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
    if (generatingRef.current) return;
    const token = ++opRef.current;
    setGenerating(true);
    cb.current.setBusy(true);
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
    cb.current.setNotice(GENERATING_TEXT);
    waitForVersion(jobSnapshotId, known, poll.maxPolls, token);
  }

  return { generating, generate, cancel };
}
