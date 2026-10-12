// @vitest-environment jsdom
// 「建議專案分組」（D23、P1-T063）：建議只顯示、不建立；使用者改名、取消某組、移動文件後按確認才送出。
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { draftFromSuggestion, draftToRequest, toggleGroup } from './grouping-model.ts';
import { ProjectGrouping } from './ProjectGrouping.tsx';
import { SUGGESTION_POLL_MS } from './useProjectSuggestion.ts';

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

const doc = (id: string, name: string) => ({ sourceDocumentId: id, name });
const READY = {
  suggestionId: 's1',
  state: 'ready',
  failure: null,
  groups: [
    { name: '甲專案', documents: [doc('d1', 'a/README.md'), doc('d2', 'a/plan.md')] },
    { name: '乙專案', documents: [doc('d3', 'b/README.md')] },
  ],
  ungrouped: [doc('d4', 'misc.md')],
};
const RUNNING = { ...READY, state: 'running', groups: [], ungrouped: [] };

function mount(transport: BridgeTransport) {
  render(createElement(BridgeProvider, { transport, children: createElement(ProjectGrouping) }));
}

afterEach(cleanup);

describe('<ProjectGrouping />', () => {
  it('按下才送出建議；完成後可編輯，按確認才建立（只送勾選的組與目前歸屬）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sent: Sent[] = [];
    let polls = 0;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        sent.push(req);
        switch (req.op) {
          case 'analysis.project_suggestion':
            polls += 1;
            return Promise.resolve({ ok: true, suggestion: polls === 1 ? null : READY });
          case 'analysis.suggest_projects':
            return Promise.resolve({ ok: true, suggestion: RUNNING });
          default:
            return Promise.resolve({ ok: true });
        }
      },
    };
    try {
      mount(transport);
      const button = await screen.findByRole('button', { name: '建議專案分組' });
      expect(sent.map((r) => r.op)).toEqual(['analysis.project_suggestion']);
      fireEvent.click(button);
      await screen.findByRole('button', { name: '建議中…' });
      await act(() => vi.advanceTimersByTimeAsync(SUGGESTION_POLL_MS));
      const first = await screen.findByRole('group', { name: '建議組 g0' });
      expect(sent.some((r) => r.op === 'claims.create_projects')).toBe(false);

      // 改名甲、把 plan.md 移到未分組、未分組的 misc.md 移到乙
      fireEvent.change(within(first).getByRole('textbox', { name: '專案名稱' }), {
        target: { value: '甲（改）' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: 'a/plan.md 移到' }), {
        target: { value: '' },
      });
      fireEvent.change(screen.getByRole('combobox', { name: 'misc.md 移到' }), {
        target: { value: 'g1' },
      });
      fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
      await screen.findByText(/已建立 2 個專案/);
      expect(sent.find((r) => r.op === 'claims.create_projects')?.payload).toEqual({
        projects: [
          { name: '甲（改）', sourceDocumentIds: ['d1'] },
          { name: '乙專案', sourceDocumentIds: ['d3', 'd4'] },
        ],
      });
      expect(screen.queryByRole('button', { name: '確認建立' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('取消的組不建立；建議失敗顯示原因；helper 拒絕顯示訊息', async () => {
    const sent: Sent[] = [];
    let suggestion: object = READY;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        sent.push(req);
        if (req.op === 'claims.create_projects') {
          return Promise.resolve({
            ok: false,
            error: { code: 'invalid_request', message: '專案分組不合法' },
          });
        }
        return Promise.resolve({ ok: true, suggestion });
      },
    };
    mount(transport);
    const second = await screen.findByRole('group', { name: '建議組 g1' });
    fireEvent.click(within(second).getByRole('checkbox', { name: '建立這組' }));
    fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
    await screen.findByText('專案分組不合法');
    expect(sent.find((r) => r.op === 'claims.create_projects')?.payload).toEqual({
      projects: [{ name: '甲專案', sourceDocumentIds: ['d1', 'd2'] }],
    });
    cleanup();

    suggestion = { ...RUNNING, state: 'failed', failure: 'invalid_output' };
    mount(transport);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('分組格式不合格'));
    expect(screen.queryByRole('button', { name: '確認建立' })).toBeNull();
  });

  it('開始新建議後，舊的查詢晚到不會蓋掉執行中畫面（codex review）', async () => {
    let releaseOld: (() => void) | null = null;
    let polls = 0;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'analysis.suggest_projects') {
          return Promise.resolve({ ok: true, suggestion: { ...RUNNING, suggestionId: 's2' } });
        }
        polls += 1;
        // 第一次（掛載時）卡住，等新建議開始後才回上一次的完成結果
        if (polls === 1) {
          return new Promise((resolve) => {
            releaseOld = () => resolve({ ok: true, suggestion: READY });
          });
        }
        return Promise.resolve({ ok: true, suggestion: { ...RUNNING, suggestionId: 's2' } });
      },
    };
    mount(transport);
    await waitFor(() => expect(releaseOld).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '建議專案分組' }));
    await screen.findByRole('button', { name: '建議中…' });
    await act(async () => {
      releaseOld?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole('button', { name: '建議中…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '確認建立' })).toBeNull();
  });
});

describe('grouping-model', () => {
  it('一組超過建立上限 1000 份文件：不送出（codex review）', () => {
    const many = Array.from({ length: 1001 }, (_, i) => doc(`d${String(i)}`, `f${String(i)}.md`));
    const view = { ...READY, groups: [{ name: '大組', documents: many }], ungrouped: [] };
    const result = draftToRequest(
      draftFromSuggestion(view as Parameters<typeof draftFromSuggestion>[0]),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it('全部取消或組名空白：不送出', () => {
    const draft = draftFromSuggestion(READY as Parameters<typeof draftFromSuggestion>[0]);
    const none = toggleGroup(toggleGroup(draft, 'g0', false), 'g1', false);
    expect(draftToRequest(none)).toEqual({ ok: false, reason: '沒有要建立的專案。' });
    const blank = { ...draft, groups: draft.groups.map((g) => ({ ...g, name: ' ' })) };
    expect(draftToRequest(blank).ok).toBe(false);
  });
});
