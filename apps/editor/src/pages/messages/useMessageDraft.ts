import type { MessageDraft } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { failureText, knownIntent, type ReplyIntent } from './labels.ts';

export interface PollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍沒有新草稿就停止並提示 */
  readonly maxPolls: number;
}

export const DEFAULT_POLL: PollOptions = { intervalMs: 3000, maxPolls: 60 };

export type Phase = 'idle' | 'generating' | 'timed_out';

/**
 * 單則訊息的草稿狀態：讀取、選意圖、要求產生（輪詢等待結果）、編輯、存檔。
 * 沒有任何送出（D7）：草稿只存在本機，由使用者複製回原平台。
 */
export function useMessageDraft(messageDraftId: string, poll: PollOptions) {
  const bridge = useBridge();
  const [message, setMessage] = useState<MessageDraft | null>(null);
  const [intent, setIntent] = useState<ReplyIntent | null>(null);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新的草稿內容：存檔回來時比對，期間又改過就不清除未存狀態。
  const latestDraft = useRef('');
  // 卸載後進行中的讀取不再排程或更新狀態。
  const disposed = useRef(false);

  const applyDraft = (next: string) => {
    latestDraft.current = next;
    setDraft(next);
  };
  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      stopPolling();
    };
  }, []);

  const load = useCallback(async () => {
    const response = await bridge.send({ op: 'messages.get', payload: { messageDraftId } });
    if (!response.ok) {
      setFailure(failureText(response));
      return null;
    }
    setMessage(response.message);
    return response.message;
  }, [bridge, messageDraftId]);

  useEffect(() => {
    void load().then((loaded) => {
      if (!loaded || disposed.current) return;
      applyDraft(loaded.draft);
      setIntent(knownIntent(loaded.replyIntent));
    });
  }, [load]);

  const waitForDraft = (previous: string, remaining: number) => {
    timer.current = setTimeout(() => {
      void load().then((loaded) => {
        if (disposed.current) return;
        if (loaded && loaded.draft !== previous) {
          applyDraft(loaded.draft);
          setDirty(false);
          setPhase('idle');
          setNotice('已產生草稿。請檢查、修改後再複製。');
        } else if (remaining <= 1) {
          setPhase('timed_out');
        } else {
          waitForDraft(previous, remaining - 1);
        }
      });
    }, poll.intervalMs);
  };

  async function generate() {
    setNotice(null);
    setFailure(null);
    if (!intent) {
      setFailure('回覆意圖不明：請先選擇「接受邀約」「詢問職務」或「婉拒」。');
      return;
    }
    stopPolling();
    const previous = message?.draft ?? '';
    const response = await bridge.send({
      op: 'request_draft',
      payload: { messageDraftId, replyIntent: intent },
    });
    if (!response.ok) {
      setFailure(failureText(response));
      return;
    }
    setPhase('generating');
    waitForDraft(previous, poll.maxPolls);
  }

  async function save() {
    setNotice(null);
    setFailure(null);
    const submitted = draft;
    const response = await bridge.send({
      op: 'messages.update_draft',
      payload: { messageDraftId, draft: submitted },
    });
    if (disposed.current) return;
    if (!response.ok) {
      setFailure(failureText(response));
      return;
    }
    // 本機已存的是送出的版本；存檔期間又改過的內容仍算未儲存。
    if (latestDraft.current === submitted) setDirty(false);
    setMessage((current) => (current ? { ...current, draft: submitted } : current));
    setNotice('已儲存草稿（只存在本機，不會送出）。');
  }

  async function copy() {
    setNotice(null);
    setFailure(null);
    try {
      await navigator.clipboard.writeText(draft);
      setNotice('已複製。請回原平台貼上，並由你自己送出。');
    } catch {
      setFailure('無法複製到剪貼簿：請手動選取草稿文字複製。');
    }
  }

  return {
    message,
    intent,
    setIntent,
    draft,
    setDraft: (next: string) => {
      applyDraft(next);
      setDirty(true);
    },
    dirty,
    phase,
    failure,
    notice,
    generate,
    save,
    copy,
  };
}
