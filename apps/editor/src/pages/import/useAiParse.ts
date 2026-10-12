import type { BridgeFailure, ImportAiDraft, ImportAiParseView } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { helperUnavailableText } from '../../bridge/helper-busy.ts';
import { AI_FAILURE_TEXT } from './ai-form.ts';

export interface AiPollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍在整理就停止並提示 */
  readonly maxPolls: number;
}

export const DEFAULT_AI_POLL: AiPollOptions = { intervalMs: 2000, maxPolls: 120 };

export type AiParseState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'succeeded'; readonly draft: ImportAiDraft }
  | { readonly kind: 'failed'; readonly message: string };

export const AI_INTERRUPTED_TEXT = 'AI 整理中斷：本機輔助程式可能重新啟動，沒有拿到結果';
export const AI_STILL_RUNNING_TEXT = 'AI 整理太久還沒完成，已停止等待';

function bridgeFailureText(failure: BridgeFailure): string {
  if (failure.error.code === 'not_implemented') return 'AI 整理尚未接上';
  if (failure.error.code === 'helper_unavailable') {
    return helperUnavailableText(failure, '連不到本機輔助程式');
  }
  return failure.error.message;
}

/**
 * 選好 PDF 後自動開始 AI 整理（P1-T069），輪詢到結束。結構上避免競態（沿用 useIntro 的教訓）：
 * - 每次開始（含自動開始）有自己的 token；切換匯入、元件卸載、StrictMode 重跑 effect 都讓舊 token 作廢
 *   並取消輪詢計時，舊的回應一律不套用。
 * - 整理期間由畫面鎖住表單（running），所以成功時直接套用不會蓋掉使用者正在打的字。
 * importId 為 null（沒有解析成功的匯入）時不開始。
 */
export function useAiParse(
  importId: string | null,
  poll: AiPollOptions,
  onDraft: (draft: ImportAiDraft) => void,
) {
  const bridge = useBridge();
  const [state, setState] = useState<AiParseState>({ kind: 'idle' });
  const opRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;

  const cancel = () => {
    opRef.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const finish = (token: number, view: ImportAiParseView | null) => {
    if (opRef.current !== token) return;
    if (view === null) setState({ kind: 'failed', message: AI_INTERRUPTED_TEXT });
    else if (view.state === 'running') setState({ kind: 'failed', message: AI_STILL_RUNNING_TEXT });
    else if (view.state === 'succeeded' && view.draft) {
      onDraftRef.current(view.draft);
      setState({ kind: 'succeeded', draft: view.draft });
    } else {
      const reason = view.failure ? AI_FAILURE_TEXT[view.failure] : 'AI 整理失敗';
      setState({ kind: 'failed', message: reason });
    }
  };

  const waitFor = (id: string, token: number, remaining: number) => {
    timer.current = setTimeout(() => {
      void bridge.send({ op: 'import.ai_status', payload: { importId: id } }).then((response) => {
        if (opRef.current !== token) return;
        if (!response.ok) {
          setState({ kind: 'failed', message: bridgeFailureText(response) });
        } else if (response.parse?.state === 'running' && remaining > 1) {
          waitFor(id, token, remaining - 1);
        } else {
          finish(token, response.parse);
        }
      });
    }, poll.intervalMs);
  };

  const start = (id: string) => {
    cancel();
    const token = opRef.current;
    setState({ kind: 'running' });
    void bridge.send({ op: 'import.ai_parse', payload: { importId: id } }).then((response) => {
      if (opRef.current !== token) return;
      if (!response.ok) setState({ kind: 'failed', message: bridgeFailureText(response) });
      else if (response.parse.state === 'running') waitFor(id, token, poll.maxPolls);
      else finish(token, response.parse);
    });
  };

  useEffect(() => {
    if (importId === null) {
      setState({ kind: 'idle' });
      return undefined;
    }
    start(importId);
    return cancel;
    // 只在換一筆匯入時自動開始一次
  }, [importId]);

  return {
    state,
    running: state.kind === 'running',
    /** 「重新用 AI 整理」：整理中不重送 */
    restart: () => {
      if (importId !== null && state.kind !== 'running') start(importId);
    },
  };
}
