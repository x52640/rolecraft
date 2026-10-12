import type { ApplicationIntro, IntroCheckView, IntroGenerationView } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { generationFailureText, introFailureText } from './intro-labels.ts';

export interface IntroPollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍在產生就停止並提示 */
  readonly maxPolls: number;
}

export const DEFAULT_INTRO_POLL: IntroPollOptions = { intervalMs: 3000, maxPolls: 60 };

/**
 * 單一職缺快照的投遞自介：讀取、要求產生（輪詢最近一次產生狀態）、編輯、儲存（helper 重跑檢查）、複製。
 * 沒有任何送出（D7）：自介只存在本機，由使用者複製後自行貼到求職網站。
 */
export function useIntro(jobSnapshotId: string, poll: IntroPollOptions) {
  const bridge = useBridge();
  const [intro, setIntro] = useState<ApplicationIntro | null>(null);
  const [check, setCheck] = useState<IntroCheckView | null>(null);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);
  const latestText = useRef('');

  const applyText = (next: string) => {
    latestText.current = next;
    setText(next);
  };

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** 讀取；回傳最近一次產生狀態（讀取失敗回 undefined）。 */
  const load = useCallback(
    async (replaceText: boolean): Promise<IntroGenerationView | null | undefined> => {
      const response = await bridge.send({ op: 'intro.get', payload: { jobSnapshotId } });
      if (disposed.current) return undefined;
      if (!response.ok) {
        setFailure(introFailureText(response));
        return undefined;
      }
      setIntro(response.intro);
      setCheck(response.check);
      if (replaceText) {
        applyText(response.intro?.text ?? '');
        setDirty(false);
      }
      return response.generation;
    },
    [bridge, jobSnapshotId],
  );

  const settle = (generation: IntroGenerationView | null) => {
    setGenerating(false);
    if (generation?.state === 'succeeded') {
      setNotice('已產生投遞自介。請檢查、修改後再複製。');
    } else if (generation?.state === 'failed' && generation.failure) {
      setFailure(generationFailureText(generation.failure, generation.problem));
    }
  };

  const waitForResult = (remaining: number) => {
    timer.current = setTimeout(() => {
      void load(false).then((generation) => {
        if (disposed.current || generation === undefined) {
          setGenerating(false);
          return;
        }
        if (generation?.state === 'running') {
          if (remaining <= 1) {
            setGenerating(false);
            setFailure('還在產生中：可以先離開，稍後重新開啟這個職缺查看。');
          } else {
            waitForResult(remaining - 1);
          }
          return;
        }
        // 產生結束：成功時換成新文字
        if (generation?.state === 'succeeded') void load(true);
        settle(generation);
      });
    }, poll.intervalMs);
  };

  useEffect(() => {
    void load(true).then((generation) => {
      if (generation?.state === 'running') {
        setGenerating(true);
        waitForResult(poll.maxPolls);
      }
    });
    // 只在切換職缺（load 改變）時讀取一次
  }, [load]);

  async function generate() {
    setNotice(null);
    setFailure(null);
    if (timer.current) clearTimeout(timer.current);
    const response = await bridge.send({ op: 'intro.generate', payload: { jobSnapshotId } });
    if (disposed.current) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
      return;
    }
    setGenerating(true);
    waitForResult(poll.maxPolls);
  }

  async function save() {
    setNotice(null);
    setFailure(null);
    const submitted = text;
    const response = await bridge.send({
      op: 'intro.update',
      payload: { jobSnapshotId, text: submitted },
    });
    if (disposed.current) return;
    if (!response.ok) {
      setFailure(introFailureText(response));
      return;
    }
    setIntro(response.intro);
    setCheck(response.check);
    if (latestText.current === submitted) setDirty(false);
    setNotice('已儲存（只存在本機，不會送出），並重新檢查。');
  }

  async function copy() {
    setNotice(null);
    setFailure(null);
    try {
      await navigator.clipboard.writeText(intro?.text ?? '');
      setNotice('已複製。請到求職網站貼上，並由你自己送出。');
    } catch {
      setFailure('無法複製到剪貼簿：請手動選取文字複製。');
    }
  }

  return {
    intro,
    check,
    text,
    setText: (next: string) => {
      applyText(next);
      setDirty(true);
    },
    dirty,
    generating,
    failure,
    notice,
    generate,
    save,
    copy,
  };
}
