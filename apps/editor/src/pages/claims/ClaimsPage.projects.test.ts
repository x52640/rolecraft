// @vitest-environment jsdom
// 事實項頁的專案整理（D23、P1-T063）：移到專案、改名、合併、刪除，以及自動預設與使用者選擇的分辨。
import type { Claim, ProjectEvidence } from '@rolecraft/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ANALYSIS_POLL_MS } from '../projects/useAnalysis.ts';
import { ClaimsPage } from './ClaimsPage.tsx';

const claimOf = (id: string, text: string): Claim => ({
  id,
  type: 'personal_role',
  text,
  basis: { sourceExcerpts: [], userConfirmation: null },
  reviewStatus: 'normal',
});

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

/** 記憶體裡的假 helper：專案與事實項歸屬可被整理操作改動。 */
function fakeHelper(initial: { projects: ProjectEvidence[]; claims: Claim[] }) {
  let projects = initial.projects.map((p) => ({ ...p, claimIds: [...p.claimIds] }));
  const claims = initial.claims;
  const sent: Sent[] = [];
  const assigned = () => new Set(projects.flatMap((p) => p.claimIds));
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as Sent;
      sent.push(req);
      const p = req.payload;
      switch (req.op) {
        case 'claims.list_projects':
          return Promise.resolve({ ok: true, projects });
        case 'claims.list': {
          const project = projects.find((x) => x.id === p.projectId);
          const list = claims.filter((c) => project?.claimIds.includes(c.id));
          return Promise.resolve({ ok: true, claims: list });
        }
        case 'claims.list_unassigned':
          return Promise.resolve({ ok: true, claims: claims.filter((c) => !assigned().has(c.id)) });
        case 'claims.move_claim':
          projects = projects.map((x) => ({
            ...x,
            claimIds: [
              ...x.claimIds.filter((id) => id !== p.claimId),
              ...(x.id === p.projectId ? [String(p.claimId)] : []),
            ],
          }));
          return Promise.resolve({ ok: true });
        case 'claims.rename_project':
          projects = projects.map((x) =>
            x.id === p.projectId ? { ...x, name: String(p.name) } : x,
          );
          return Promise.resolve({ ok: true });
        case 'claims.merge_projects': {
          const from = projects.find((x) => x.id === p.projectId);
          projects = projects
            .filter((x) => x.id !== p.projectId)
            .map((x) =>
              x.id === p.intoProjectId
                ? { ...x, claimIds: [...x.claimIds, ...(from?.claimIds ?? [])] }
                : x,
            );
          return Promise.resolve({ ok: true });
        }
        case 'claims.delete_project':
          projects = projects.filter((x) => x.id !== p.projectId);
          return Promise.resolve({ ok: true });
        default:
          return Promise.resolve({ ok: true, analysis: null });
      }
    },
  };
  return { transport, sent };
}

function mount(transport: BridgeTransport) {
  render(createElement(BridgeProvider, { transport, children: createElement(ClaimsPage) }));
}

const projectSelect = () => screen.getByRole<HTMLSelectElement>('combobox', { name: '專案' });
const selectedName = () => projectSelect().selectedOptions[0]?.textContent;

afterEach(cleanup);

const P1: ProjectEvidence = { id: 'p1', name: '甲專案', summary: '', claimIds: ['c1'] };
const P2: ProjectEvidence = { id: 'p2', name: '乙專案', summary: '', claimIds: ['c2'] };

describe('<ClaimsPage /> 專案整理', () => {
  it('事實項「移到專案…」送 claims.move_claim，之後清單同步更新', async () => {
    const h = fakeHelper({
      projects: [P1, P2],
      claims: [claimOf('c1', '甲'), claimOf('c2', '乙')],
    });
    mount(h.transport);
    const card = await screen.findByRole('article', { name: '甲' });
    fireEvent.change(within(card).getByRole('combobox', { name: '移到專案' }), {
      target: { value: '__unassigned__' },
    });
    await screen.findByText('已移回未歸專案。');
    expect(h.sent.find((r) => r.op === 'claims.move_claim')?.payload).toEqual({
      claimId: 'c1',
      projectId: null,
    });
    await waitFor(() => expect(screen.queryByRole('article', { name: '甲' })).toBeNull());
    fireEvent.change(projectSelect(), { target: { value: '' } });
    const moved = await screen.findByRole('article', { name: '甲' });
    fireEvent.change(within(moved).getByRole('combobox', { name: '移到專案' }), {
      target: { value: 'p2' },
    });
    await screen.findByText('已移到所選專案。');
    expect(h.sent.at(-2)?.payload).toEqual({ claimId: 'c1', projectId: 'p2' });
  });

  it('改名、合併、刪除：送對應操作並重新讀專案；目前專案不在了就回到自動預設', async () => {
    const h = fakeHelper({
      projects: [P1, P2],
      claims: [claimOf('c1', '甲'), claimOf('c2', '乙')],
    });
    mount(h.transport);
    await screen.findByRole('article', { name: '甲' });
    const tools = screen.getByRole('region', { name: '整理專案' });

    fireEvent.change(within(tools).getByRole('textbox', { name: '專案名稱' }), {
      target: { value: '新甲' },
    });
    fireEvent.click(within(tools).getByRole('button', { name: '改名' }));
    await waitFor(() => expect(selectedName()).toBe('新甲'));
    expect(h.sent.find((r) => r.op === 'claims.rename_project')?.payload).toEqual({
      projectId: 'p1',
      name: '新甲',
    });

    const tools2 = screen.getByRole('region', { name: '整理專案' });
    fireEvent.change(within(tools2).getByRole('combobox', { name: '併入' }), {
      target: { value: 'p2' },
    });
    fireEvent.click(within(tools2).getByRole('button', { name: '合併' }));
    fireEvent.click(within(tools2).getByRole('button', { name: '確定合併' }));
    await waitFor(() => expect(selectedName()).toBe('乙專案'));
    expect(h.sent.find((r) => r.op === 'claims.merge_projects')?.payload).toEqual({
      projectId: 'p1',
      intoProjectId: 'p2',
    });
    expect(await screen.findByRole('article', { name: '甲' })).toBeTruthy();

    const tools3 = screen.getByRole('region', { name: '整理專案' });
    fireEvent.click(within(tools3).getByRole('button', { name: '刪除專案' }));
    fireEvent.click(within(tools3).getByRole('button', { name: '確定刪除專案' }));
    await waitFor(() => expect(selectedName()).toBe('未歸專案'));
    expect(await screen.findByRole('article', { name: '甲' })).toBeTruthy();
    expect(screen.getByRole('article', { name: '乙' })).toBeTruthy();
  });

  it('未歸專案清單讀不到：預設停在未歸專案顯示錯誤，不靜默選第一個專案', async () => {
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') return Promise.resolve({ ok: true, projects: [P1] });
        if (req.op === 'claims.list_unassigned') {
          return Promise.resolve({
            ok: false,
            error: { code: 'internal_error', message: '讀取失敗' },
          });
        }
        return Promise.resolve({ ok: true, claims: [claimOf('c1', '甲')] });
      },
    };
    mount(transport);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('讀取失敗'));
    expect(selectedName()).toBe('未歸專案');
    expect(screen.queryByRole('article', { name: '甲' })).toBeNull();
  });

  it('自動預設在分析結束後重算；使用者自己選的保留', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    let statuses = 0;
    let fresh = false;
    const transport = (statusOf: () => object): BridgeTransport => ({
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'analysis.status')
          return Promise.resolve({ ok: true, analysis: statusOf() });
        if (req.op === 'claims.list_projects') return Promise.resolve({ ok: true, projects: [P1] });
        if (req.op === 'claims.list_unassigned') {
          return Promise.resolve({ ok: true, claims: fresh ? [claimOf('u1', '新產出')] : [] });
        }
        return Promise.resolve({ ok: true, claims: [claimOf('c1', '甲')] });
      },
    });
    const finishing = () => {
      statuses += 1;
      if (statuses > 1) fresh = true;
      return statuses === 1 ? running : { ...running, state: 'completed', completedUnits: 1 };
    };
    try {
      // 自動預設：一開始沒有未歸的 → 第一個專案；分析結束有新的未歸 → 改成未歸專案
      mount(transport(finishing));
      await screen.findByRole('article', { name: '甲' });
      await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS));
      expect(await screen.findByRole('article', { name: '新產出' })).toBeTruthy();
      expect(selectedName()).toBe('未歸專案');
      cleanup();

      // 使用者自己選了專案：分析結束後仍停在該專案
      statuses = 0;
      fresh = false;
      mount(transport(finishing));
      await screen.findByRole('article', { name: '甲' });
      fireEvent.change(projectSelect(), { target: { value: 'p1' } });
      await act(() => vi.advanceTimersByTimeAsync(ANALYSIS_POLL_MS));
      await waitFor(() => expect(statuses).toBeGreaterThan(1));
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(selectedName()).toBe('甲專案');
      expect(screen.getByRole('article', { name: '甲' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
