import type { BridgeFailure, ImportAiParseView } from '@rolecraft/contracts';
import { useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { helperUnavailableText } from '../../bridge/helper-busy.ts';
import { AI_FAILURE_TEXT, type AiDraftLike } from './ai-form.ts';

export interface AiPollOptions {
  /** 輪詢間隔（毫秒） */
  readonly intervalMs: number;
  /** 最多輪詢幾次；用完仍在整理就停止並提示 */
  readonly maxPolls: number;
}

export const DEFAULT_AI_POLL: AiPollOptions = { intervalMs: 2000, maxPolls: 120 };

/**
 * 一次核對的 AI 整理設定。key 每開一次核對就換一個（同一份網頁擷取再按「使用這份」也是新的核對）。
 * auto 只有 PDF 非 104 版面為 true；網頁來源一律 false（D28 Q4＝B：按「用 AI 整理」才呼叫模型）。
 */
export interface AiSession {
  readonly key: number;
  readonly importId: string;
  readonly auto: boolean;
}

export type AiParseState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  /** helper 回 name_required（網頁來源本次頁面姓名沒辨識出來）：要使用者確認姓名才送，模型沒被呼叫 */
  | { readonly kind: 'needs_name' }
  | { readonly kind: 'succeeded'; readonly draft: AiDraftLike }
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

/** 成功時的草稿：網頁來源在 webDraft（出處是區塊編號），PDF 在 draft。 */
const draftOf = (view: ImportAiParseView): AiDraftLike | null =>
  view.source === 'web' ? (view.webDraft ?? null) : view.draft;

/**
 * AI 整理（P1-T069；D28 加網頁來源），輪詢到結束。結構上避免競態（沿用 useIntro 的教訓）：
 * - 每次開始有自己的 token；換一次核對、元件卸載、StrictMode 重跑 effect 都讓舊 token 作廢
 *   並取消輪詢計時，舊的回應一律不套用。
 * - 整理期間由畫面鎖住表單（running），所以成功時直接套用不會蓋掉使用者正在打的字。
 * session 為 null（沒有可整理的原文）時不開始。auto 為 false（104 版面、網頁來源）時不自動開始，
 * 只在使用者按「用 AI 整理」（restart）時才呼叫。auto 是唯一不經使用者按鈕就送 import.ai_parse 的入口。
 */
export function useAiParse(
  session: AiSession | null,
  poll: AiPollOptions,
  onDraft: (draft: AiDraftLike) => void,
) {
  const bridge = useBridge();
  const [state, setState] = useState<AiParseState>({ kind: 'idle' });
  const opRef = useRef(0);
  // 目前這次整理屬於哪一次核對（session.key）。換核對的 effect 只作廢「別次核對」的整理：
  // 開啟核對的 effect 可能晚於使用者按「用 AI 整理」才執行（React 的 passive effect 延後），
  // 不能把剛送出的這次也作廢，否則已送出的 import.ai_parse 結果被丟掉、畫面卡在未整理（偶發失敗的原因）。
  const runKey = useRef<number | null>(null);
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
    const draft = view === null ? null : draftOf(view);
    if (view === null) setState({ kind: 'failed', message: AI_INTERRUPTED_TEXT });
    else if (view.state === 'running') setState({ kind: 'failed', message: AI_STILL_RUNNING_TEXT });
    else if (view.state === 'succeeded' && draft) {
      onDraftRef.current(draft);
      setState({ kind: 'succeeded', draft });
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

  const start = (key: number, id: string, names?: readonly string[]) => {
    cancel();
    runKey.current = key;
    const token = opRef.current;
    setState({ kind: 'running' });
    const payload = names ? { importId: id, names: [...names] } : { importId: id };
    void bridge.send({ op: 'import.ai_parse', payload }).then((response) => {
      if (opRef.current !== token) return;
      if (!response.ok && response.error.reason === 'name_required') {
        setState({ kind: 'needs_name' });
      } else if (!response.ok) setState({ kind: 'failed', message: bridgeFailureText(response) });
      else if (response.parse.state === 'running') waitFor(id, token, poll.maxPolls);
      else finish(token, response.parse);
    });
  };

  useEffect(() => {
    const key = session?.key ?? null;
    // 收尾只作廢屬於這次核對（或沒有歸屬）的整理；新核對已由按鈕開始的整理不動
    const release = () => {
      if (runKey.current !== null && runKey.current !== key) return;
      runKey.current = null;
      cancel();
    };
    // 這次核對已由使用者按鈕開始整理（effect 晚到）：保留，不作廢、不重設
    if (key !== null && runKey.current === key) return release;
    runKey.current = null;
    if (session === null || !session.auto) {
      cancel();
      setState({ kind: 'idle' });
      return release;
    }
    start(session.key, session.importId);
    return release;
    // 只在換一次核對時決定一次（auto 跟著核對一起設定）
  }, [session?.key]);

  return {
    state,
    running: state.kind === 'running',
    /** 使用者按「用 AI 整理」／「用 AI 重新整理」或確認姓名：整理中不重送 */
    restart: (names?: readonly string[]) => {
      if (session !== null && state.kind !== 'running') start(session.key, session.importId, names);
    },
  };
}
