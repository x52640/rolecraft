// @vitest-environment jsdom
import type { AnalysisStatusView } from '@rolecraft/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { AnalysisPanel } from './AnalysisPanel.tsx';
import { ANALYSIS_POLL_MS } from './useAnalysis.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const view = (over: Partial<AnalysisStatusView>): AnalysisStatusView => ({
  workJobId: 'job-1',
  state: 'running',
  pauseReason: null,
  blockReason: null,
  completedUnits: 0,
  totalUnits: 2,
  claimsAdded: 0,
  claimsUpdated: 0,
  ...over,
});

/** 假 helper：status 依序回 statuses（用完停在最後一個），start 回 startResult。 */
function fakeHelper(statuses: (AnalysisStatusView | null)[], startResult: object) {
  const sent: string[] = [];
  const transport: BridgeTransport = {
    send(raw) {
      const { op } = raw as { op: string };
      sent.push(op);
      if (op === 'analysis.start') return Promise.resolve(startResult);
      const analysis = statuses.length > 1 ? statuses.shift() : statuses[0];
      return Promise.resolve({ ok: true, analysis: analysis ?? null });
    },
  };
  render(<BridgeProvider transport={transport}>{<AnalysisPanel />}</BridgeProvider>);
  return sent;
}

describe('<AnalysisPanel />（P1-T060）', () => {
  it('沒分析過：按「分析資料夾」才送出；沒有要分析的文件時提示', async () => {
    const sent = fakeHelper([null], { ok: true, workJobId: null });
    fireEvent.click(await screen.findByRole('button', { name: '分析資料夾' }));
    expect(await screen.findByText('沒有新增或變更的已授權文件，不需要分析。')).toBeTruthy();
    expect(sent.filter((op) => op === 'analysis.start')).toHaveLength(1);
  });

  it('已暫停：顯示暫停原因，按鈕變「繼續分析」；不按就不續跑（D21）', async () => {
    const paused = view({ state: 'paused', pauseReason: 'quota_exhausted', completedUnits: 1 });
    const sent = fakeHelper([paused], { ok: true, workJobId: 'job-1' });
    expect((await screen.findByLabelText('分析進度')).textContent).toContain('額度用完');
    expect(sent).not.toContain('analysis.start');
    fireEvent.click(screen.getByRole('button', { name: '繼續分析' }));
    await vi.waitFor(() => expect(sent).toContain('analysis.start'));
  });

  it('被擋：顯示原因，可按「繼續分析」', async () => {
    fakeHelper([view({ state: 'blocked', blockReason: 'run_check_failed' })], { ok: true });
    expect((await screen.findByLabelText('分析進度')).textContent).toContain('訂閱路線確認');
    expect(screen.getByRole('button', { name: '繼續分析' })).toBeTruthy();
  });

  it('執行中：按鈕停用並定期查詢進度，直到完成', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = view({ state: 'completed', completedUnits: 2, claimsAdded: 3 });
    fakeHelper([view({ completedUnits: 1 }), done], { ok: true, workJobId: 'job-1' });
    const button = await screen.findByRole('button', { name: '分析中…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS));
    expect((await screen.findByLabelText('分析進度')).textContent).toContain('分析完成');
    expect(screen.getByRole('button', { name: '分析資料夾' })).toBeTruthy();
  });

  it('啟動失敗：顯示 helper 的固定訊息', async () => {
    const failure = {
      ok: false,
      error: { code: 'invalid_request', message: '尚未選定可用的模型' },
    };
    fakeHelper([null], failure);
    fireEvent.click(await screen.findByRole('button', { name: '分析資料夾' }));
    expect(await screen.findByText('尚未選定可用的模型')).toBeTruthy();
  });
});
