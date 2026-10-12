// @vitest-environment jsdom
// 未歸專案的事實項（D23、P1-T061）。
import type { Claim } from '@rolecraft/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ANALYSIS_POLL_MS } from '../projects/useAnalysis.ts';
import { ClaimsPage } from './ClaimsPage.tsx';

const claimOf = (id: string, text: string, over: Partial<Claim> = {}): Claim => ({
  id,
  type: 'personal_role',
  text,
  basis: {
    sourceExcerpts: [
      {
        sourceDocumentId: 'doc-1',
        contentVersion: 1,
        contentHash: 'a'.repeat(64),
        location: 'tb2:1:1/1:abc',
        text,
      },
    ],
    userConfirmation: null,
  },
  reviewStatus: 'normal',
  ...over,
});

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

const P1 = { id: 'p1', name: '甲專案', summary: '', claimIds: [] };

function mount(transport: BridgeTransport) {
  render(createElement(BridgeProvider, { transport, children: createElement(ClaimsPage) }));
}

afterEach(cleanup);

describe('<ClaimsPage /> 未歸專案', () => {
  it('零專案：看得到未歸專案的事實項，確認走 claims.confirm，之後重新讀同一清單', async () => {
    const sent: Sent[] = [];
    let confirmed = false;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        sent.push(req);
        switch (req.op) {
          case 'claims.list_projects':
            return Promise.resolve({ ok: true, projects: [] });
          case 'claims.list_unassigned': {
            const userConfirmation = confirmed
              ? { confirmedAt: '2026-10-10T08:00:00.000Z', text: '負責後端' }
              : null;
            const base = claimOf('u1', '負責後端');
            return Promise.resolve({
              ok: true,
              claims: [{ ...base, basis: { ...base.basis, userConfirmation } }],
            });
          }
          case 'claims.confirm':
            confirmed = true;
            return Promise.resolve({ ok: true });
          default:
            return Promise.resolve({ ok: true, analysis: null });
        }
      },
    };
    mount(transport);
    const role = await screen.findByRole('article', { name: '負責後端' });
    expect(screen.getByText(/還沒有任何專案/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLSelectElement>('combobox', { name: '專案' }).selectedOptions[0]
        ?.textContent,
    ).toBe('未歸專案');
    fireEvent.click(within(role).getByRole('button', { name: '確認此項' }));
    await screen.findByText('已確認。');
    await waitFor(() =>
      expect(screen.getByRole('article', { name: '負責後端' }).textContent).toMatch(
        /你已於 .* 確認此內容/,
      ),
    );
    expect(sent.find((r) => r.op === 'claims.confirm')?.payload).toEqual({
      claimId: 'u1',
      text: '負責後端',
      expectedReviewStatus: 'normal',
    });
    expect(sent.filter((r) => r.op === 'claims.list')).toEqual([]);
  });

  it('有專案也有未歸專案事實項：預設顯示未歸專案；沒有未歸的就預設第一個專案', async () => {
    let unassigned = [claimOf('u1', '未歸的事實')];
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') return Promise.resolve({ ok: true, projects: [P1] });
        if (req.op === 'claims.list_unassigned') {
          return Promise.resolve({ ok: true, claims: unassigned });
        }
        return Promise.resolve({ ok: true, claims: [claimOf('c1', '甲的事實')] });
      },
    };
    mount(transport);
    expect(await screen.findByRole('article', { name: '未歸的事實' })).toBeTruthy();
    cleanup();
    unassigned = [];
    mount(transport);
    expect(await screen.findByRole('article', { name: '甲的事實' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: '未歸的事實' })).toBeNull();
  });

  it('從未歸專案切到專案後，較慢回來的未歸清單不會蓋掉專案清單', async () => {
    let releaseUnassigned = null as (() => void) | null;
    let unassignedCalls = 0;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') return Promise.resolve({ ok: true, projects: [P1] });
        if (req.op === 'claims.list_unassigned') {
          unassignedCalls += 1;
          const claims = [claimOf('u1', '未歸的事實')];
          // 第一次（決定預設）立即回；第二次（讀清單）卡住，等切到專案後才回
          if (unassignedCalls === 1) return Promise.resolve({ ok: true, claims });
          return new Promise((resolve) => {
            releaseUnassigned = () => resolve({ ok: true, claims });
          });
        }
        return Promise.resolve({ ok: true, claims: [claimOf('c1', '甲的事實')] });
      },
    };
    mount(transport);
    const select = await screen.findByRole('combobox', { name: '專案' });
    await waitFor(() => expect(releaseUnassigned).not.toBeNull());
    fireEvent.change(select, { target: { value: 'p1' } });
    await screen.findByRole('article', { name: '甲的事實' });
    releaseUnassigned?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('article', { name: '未歸的事實' })).toBeNull();
    expect(screen.getByRole('article', { name: '甲的事實' })).toBeTruthy();
  });

  it('分析（P1-T060）在這頁開著時跑完：也重新讀未歸專案清單', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let statuses = 0;
    let unassignedCalls = 0;
    const running = {
      workJobId: 'job-1',
      state: 'running',
      pauseReason: null,
      blockReason: null,
      completedUnits: 0,
      totalUnits: 1,
      claimsAdded: 0,
      claimsUpdated: 0,
    };
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'analysis.status') {
          statuses += 1;
          const analysis =
            statuses === 1 ? running : { ...running, state: 'completed', completedUnits: 1 };
          return Promise.resolve({ ok: true, analysis });
        }
        if (req.op === 'claims.list_projects') return Promise.resolve({ ok: true, projects: [] });
        unassignedCalls += 1;
        // 前兩次（決定預設、讀清單）是分析前，之後才有新事實項
        const claims = unassignedCalls <= 2 ? [] : [claimOf('u1', '負責後端')];
        return Promise.resolve({ ok: true, claims });
      },
    };
    try {
      mount(transport);
      await screen.findByText('沒有未歸專案的事實項。');
      await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS));
      expect(await screen.findByRole('article', { name: '負責後端' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
