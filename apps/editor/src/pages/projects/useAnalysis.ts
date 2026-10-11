import type { AnalysisStatusView } from '@rolecraft/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBridge } from '../../bridge/BridgeProvider.tsx';
import { failureText } from './failure-text.ts';

/** 分析執行中時查詢進度的間隔。 */
export const ANALYSIS_POLL_MS = 2000;

export type AnalysisLoad =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; value: AnalysisStatusView | null };

/**
 * 分析進度與「分析資料夾／繼續分析」（P1-T060）。進度只在執行中時定期查詢；
 * 續跑只在使用者按下時送出（D21），這裡沒有任何自動續跑。
 * onFinished：看到執行中的工作結束（完成、暫停、被擋）時呼叫一次，給事實項頁重新整理用。
 */
export function useAnalysis(onFinished?: () => void) {
  const bridge = useBridge();
  const [load, setLoad] = useState<AnalysisLoad>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const wasRunning = useRef(false);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  const refresh = useCallback(async () => {
    const res = await bridge.send({ op: 'analysis.status', payload: {} });
    if (!res.ok) {
      setLoad({ state: 'error', message: failureText(res) });
      return;
    }
    const running = res.analysis?.state === 'running';
    if (wasRunning.current && !running) finished.current?.();
    wasRunning.current = running;
    setLoad({ state: 'ready', value: res.analysis });
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = load.state === 'ready' && load.value?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh(), ANALYSIS_POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const start = async () => {
    setBusy(true);
    setNotice(null);
    const res = await bridge.send({ op: 'analysis.start', payload: {} });
    setBusy(false);
    if (!res.ok) setNotice(failureText(res));
    else if (res.workJobId === null) setNotice('沒有新增或變更的已授權文件，不需要分析。');
    await refresh();
  };

  return { load, busy, notice, start };
}
