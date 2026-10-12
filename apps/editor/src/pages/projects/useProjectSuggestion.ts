import type { ProjectSuggestionView } from '@rolecraft/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { failureText } from './failure-text.ts';
import { draftFromSuggestion, draftToRequest, type GroupingDraft } from './grouping-model.ts';

/** 建議執行中時查詢的間隔。 */
export const SUGGESTION_POLL_MS = 2000;

/**
 * 「建議專案分組」（D23、P1-T063）：只在使用者按下時請 helper 送出；建議完成後變成可編輯的草稿，
 * 使用者按「確認建立」才建立專案。建議本身不建立任何東西。
 */
export function useProjectSuggestion() {
  const bridge = useBridge();
  const [view, setView] = useState<ProjectSuggestionView | null>(null);
  const [draft, setDraft] = useState<GroupingDraft | null>(null);
  // 已確認建立（或放棄）的建議：不再顯示成草稿
  const [consumed, setConsumed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const accept = useCallback((next: ProjectSuggestionView | null) => {
    setView(next);
    if (next?.state === 'ready') {
      setDraft((current) => current ?? draftFromSuggestion(next));
    }
  }, []);

  const refresh = useCallback(async () => {
    const res = await bridge.send({ op: 'analysis.project_suggestion', payload: {} });
    if (res.ok) accept(res.suggestion);
    else setNotice(failureText(res));
  }, [bridge, accept]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = view?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), SUGGESTION_POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const suggest = async () => {
    setBusy(true);
    setNotice(null);
    setDraft(null);
    try {
      const res = await bridge.send({ op: 'analysis.suggest_projects', payload: {} });
      if (res.ok) accept(res.suggestion);
      else setNotice(failureText(res));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!draft || !view) return;
    const request = draftToRequest(draft);
    if (!request.ok) {
      setNotice(request.reason);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await bridge.send({
        op: 'claims.create_projects',
        payload: { projects: request.projects },
      });
      if (!res.ok) {
        setNotice(failureText(res));
        return;
      }
      setConsumed(view.suggestionId);
      setDraft(null);
      setNotice(
        `已建立 ${String(request.projects.length)} 個專案；相關事實項已歸入，可到「事實項」頁檢視與整理。`,
      );
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (view) setConsumed(view.suggestionId);
    setDraft(null);
  };

  const showDraft = view !== null && view.suggestionId !== consumed ? draft : null;
  return { view, draft: showDraft, setDraft, busy, notice, suggest, confirm, discard };
}
