// @vitest-environment jsdom
import type { Claim } from '@rolecraft/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ANALYSIS_POLL_MS } from '../projects/useAnalysis.ts';
import { ClaimsPage } from './ClaimsPage.tsx';

const excerpt = (text: string) => ({
  sourceDocumentId: 'doc-1',
  contentVersion: 2,
  contentHash: 'a'.repeat(64),
  location: 'tb2:3:1/1:abc',
  text,
});

const FEATURE: Claim = {
  id: 'c-feature',
  type: 'feature',
  text: '支援 PDF 匯出',
  completionStatus: 'documented_done',
  basis: { sourceExcerpts: [excerpt('- [x] PDF 匯出')], userConfirmation: null },
  reviewStatus: 'normal',
};
const ROLE: Claim = {
  id: 'c-role',
  type: 'personal_role',
  text: '負責後端',
  basis: { sourceExcerpts: [excerpt('我負責後端')], userConfirmation: null },
  reviewStatus: 'normal',
};
const REVIEW: Claim = {
  ...FEATURE,
  id: 'c-review',
  text: '支援登入',
  reviewStatus: 'needs_review',
};

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

/** 假 helper：只回事實項相關操作，記下送出的請求。 */
function fakeHelper(claims: Claim[] = [FEATURE, ROLE, REVIEW], fail = false) {
  const sent: Sent[] = [];
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as Sent;
      sent.push(req);
      if (fail) {
        return Promise.resolve({
          ok: false,
          error: { code: 'not_implemented', message: '此操作尚未支援' },
        });
      }
      switch (req.op) {
        case 'claims.list_projects':
          return Promise.resolve({
            ok: true,
            projects: [{ id: 'p1', name: 'RoleCraft', summary: '', claimIds: [] }],
          });
        case 'claims.list':
          return Promise.resolve({ ok: true, claims });
        case 'claims.list_unassigned':
          return Promise.resolve({ ok: true, claims: [] });
        default:
          return Promise.resolve({ ok: true });
      }
    },
  };
  return {
    transport,
    sent,
    writes: () => sent.filter((s) => !s.op.includes('list') && s.op !== 'analysis.status'),
  };
}

function renderPage(helper: ReturnType<typeof fakeHelper>) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ClaimsPage),
    }),
  );
}

const card = (text: string) => screen.getByRole('article', { name: text });

afterEach(cleanup);

describe('<ClaimsPage />', () => {
  it('列出事實項，與來源原文並列；文件標示完成註明不等於完成', async () => {
    renderPage(fakeHelper());
    const feature = await screen.findByRole('article', { name: '支援 PDF 匯出' });
    expect(within(feature).getByText('- [x] PDF 匯出')).toBeTruthy();
    expect(within(feature).getByText(/文件 doc-1・第 2 版・第 4 段/)).toBeTruthy();
    expect(feature.textContent).toContain('文件標示完成（尚未經你確認，不等於完成）');
    expect(feature.textContent).toContain('尚未經你確認');
    expect(card('支援登入').textContent).toContain('待複核');
  });

  it('功能要先選完成狀態才能確認；送出畫面上的文字，不帶確認時間', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const feature = await screen.findByRole('article', { name: '支援 PDF 匯出' });
    const confirm = within(feature).getByRole('button', { name: '確認此項' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(feature).getByRole('combobox', { name: '確認為' }), {
      target: { value: 'user_confirmed_done' },
    });
    fireEvent.click(confirm);
    await screen.findByText('已確認。');
    expect(helper.writes()).toEqual([
      {
        op: 'claims.confirm',
        payload: {
          claimId: 'c-feature',
          text: '支援 PDF 匯出',
          completion: 'user_confirmed_done',
          expectedReviewStatus: 'normal',
        },
      },
    ]);
  });

  it('非功能類型確認不帶完成狀態', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const role = await screen.findByRole('article', { name: '負責後端' });
    expect(within(role).queryByRole('combobox', { name: '確認為' })).toBeNull();
    fireEvent.click(within(role).getByRole('button', { name: '確認此項' }));
    await screen.findByText('已確認。');
    expect(helper.writes()[0]?.payload).toEqual({
      claimId: 'c-role',
      text: '負責後端',
      expectedReviewStatus: 'normal',
    });
  });

  it('批次確認：待複核不能勾；功能沒選完成狀態時一項都不送', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await screen.findByRole('article', { name: '支援 PDF 匯出' });
    const box = (text: string) =>
      within(card(text)).getByRole<HTMLInputElement>('checkbox', { name: '加入批次確認' });
    expect(box('支援登入').disabled).toBe(true);
    fireEvent.click(box('支援 PDF 匯出'));
    fireEvent.click(box('負責後端'));
    fireEvent.click(screen.getByRole('button', { name: '批次確認所選（2）' }));
    await screen.findByText(/要先選擇「確認為」/);
    expect(helper.writes()).toEqual([]);

    fireEvent.change(within(card('支援 PDF 匯出')).getByRole('combobox', { name: '確認為' }), {
      target: { value: 'planned' },
    });
    fireEvent.click(screen.getByRole('button', { name: '批次確認所選（2）' }));
    await screen.findByText('已確認 2 項。');
    expect(helper.writes().map((w) => w.payload)).toEqual([
      {
        claimId: 'c-feature',
        text: '支援 PDF 匯出',
        completion: 'planned',
        expectedReviewStatus: 'normal',
      },
      { claimId: 'c-role', text: '負責後端', expectedReviewStatus: 'normal' },
    ]);
  });

  it('修改內容：送 claims.update，提示原確認失效', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '修改' }));
    fireEvent.change(within(role).getByRole('textbox'), { target: { value: '負責後端與部署' } });
    fireEvent.click(within(role).getByRole('button', { name: '儲存修改' }));
    await screen.findByText(/原本的確認已失效/);
    expect(helper.writes()).toEqual([
      { op: 'claims.update', payload: { claimId: 'c-role', text: '負責後端與部署' } },
    ]);
  });

  it('刪除要按兩次（說明匯出版本影響）', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '刪除' }));
    expect(helper.writes()).toEqual([]);
    expect(within(role).getByRole('group', { name: '確認刪除' }).textContent).toContain(
      '尚未投遞的匯出版本會一併刪除',
    );
    expect(within(role).getByRole('group', { name: '確認刪除' }).textContent).toContain(
      '已投遞的匯出版本會保留（含此事實項的副本）',
    );
    fireEvent.click(within(role).getByRole('button', { name: '確定刪除' }));
    await screen.findByText(/已刪除/);
    expect(helper.writes()).toEqual([{ op: 'claims.reject', payload: { claimId: 'c-role' } }]);
  });

  it('已確認且內容一致顯示確認時間；內容改過顯示需重新確認', async () => {
    const confirmed: Claim = {
      ...ROLE,
      basis: {
        ...ROLE.basis,
        userConfirmation: { confirmedAt: '2026-10-10T08:00:00.000Z', text: '負責後端' },
      },
    };
    const stale: Claim = { ...confirmed, id: 'c-stale', text: '負責全端' };
    renderPage(fakeHelper([confirmed, stale]));
    expect((await screen.findByRole('article', { name: '負責後端' })).textContent).toMatch(
      /你已於 .* 確認此內容/,
    );
    expect(card('負責全端').textContent).toContain('確認後內容已改變，需要重新確認');
  });

  it('畫面狀態過時：helper 拒絕確認後顯示原因並重新讀取', async () => {
    let lists = 0;
    const sent: Sent[] = [];
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        sent.push(req);
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({
            ok: true,
            projects: [{ id: 'p1', name: 'RoleCraft', summary: '', claimIds: [] }],
          });
        }
        if (req.op === 'claims.list') {
          lists += 1;
          const claim = lists === 1 ? ROLE : { ...ROLE, reviewStatus: 'source_conflict' };
          return Promise.resolve({ ok: true, claims: [claim] });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        return Promise.resolve({
          ok: false,
          error: { code: 'invalid_request', message: '事實項的複核狀態已改變，請重新讀取' },
        });
      },
    };
    renderPage({ transport, sent, writes: () => [] });
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '確認此項' }));
    await screen.findByText(/複核狀態已改變/);
    await waitFor(() => expect(card('負責後端').textContent).toContain('來源矛盾'));
    expect(sent.find((r) => r.op === 'claims.confirm')?.payload).toMatchObject({
      expectedReviewStatus: 'normal',
    });
  });

  it('helper 未接上：顯示錯誤，不顯示任何事實項', async () => {
    renderPage(fakeHelper([], true));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('此操作尚未支援'));
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('分析（P1-T060）在這頁開著時跑完：重新讀專案與事實項', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sent: Sent[] = [];
    let statuses = 0;
    let lists = 0;
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
        sent.push(req);
        if (req.op === 'analysis.status') {
          statuses += 1;
          const analysis =
            statuses === 1 ? running : { ...running, state: 'completed', completedUnits: 1 };
          return Promise.resolve({ ok: true, analysis });
        }
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({
            ok: true,
            projects: [{ id: 'p1', name: 'RoleCraft', summary: '', claimIds: [] }],
          });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        lists += 1;
        return Promise.resolve({ ok: true, claims: lists === 1 ? [] : [ROLE] });
      },
    };
    try {
      renderPage({ transport, sent, writes: () => [] });
      await screen.findByText('這個專案還沒有事實項。');
      await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS));
      expect(await screen.findByRole('article', { name: '負責後端' })).toBeTruthy();
      expect(sent.filter((r) => r.op === 'claims.list_projects')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
