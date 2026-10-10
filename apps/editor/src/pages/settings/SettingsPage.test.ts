// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import type { ServiceStatus } from './labels.ts';
import { SettingsPage } from './SettingsPage.tsx';

afterEach(cleanup);

const status = (patch: Partial<ServiceStatus> & Pick<ServiceStatus, 'service'>): ServiceStatus => ({
  state: 'unsupported',
  login: 'unknown',
  eligibility: 'unknown',
  subscriptionOnly: 'unknown',
  checkedAt: null,
  selectedCandidateId: null,
  ...patch,
});

const CANDIDATES = [
  { candidateId: 'c1', label: 'Claude Haiku' },
  { candidateId: 'c2', label: 'Claude Sonnet' },
];

function fakeHelper(claude: Partial<ServiceStatus>, replies: Record<string, unknown> = {}) {
  const requests: { op: string; payload: Record<string, unknown> }[] = [];
  let claudeStatus = status({ service: 'claude', ...claude });
  const send = vi.fn((raw: unknown) => {
    const req = raw as { op: string; payload: Record<string, unknown> };
    requests.push(req);
    if (req.op in replies) return Promise.resolve(replies[req.op]);
    switch (req.op) {
      case 'providers.status':
        return Promise.resolve({
          ok: true,
          services: [
            claudeStatus,
            status({ service: 'codex' }),
            status({ service: 'antigravity' }),
          ],
        });
      case 'providers.list_candidates':
        return Promise.resolve({ ok: true, candidates: CANDIDATES });
      case 'providers.select_candidate':
        claudeStatus = {
          ...claudeStatus,
          selectedCandidateId: req.payload['candidateId'] as string,
        };
        return Promise.resolve({ ok: true, verification: 'passed' });
      default:
        return Promise.resolve({
          ok: false,
          error: { code: 'not_implemented', message: '此操作尚未支援' },
        });
    }
  });
  const transport: BridgeTransport = { send };
  return { transport, requests };
}

function renderPage(transport: BridgeTransport | null) {
  return render(
    createElement(BridgeProvider, { transport, children: createElement(SettingsPage) }),
  );
}

const card = (name: RegExp) => screen.getByRole('article', { name });

describe('<SettingsPage />', () => {
  it('三張狀態卡；Codex、Antigravity 顯示尚未支援且沒有檢查按鈕', async () => {
    const { transport } = fakeHelper({ state: 'not_logged_in', login: 'failed' });
    renderPage(transport);
    await screen.findByRole('article', { name: /Claude/ });
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(within(card(/Claude/)).getByText('未登入')).toBeTruthy();
    for (const name of [/Codex/, /Antigravity/]) {
      expect(within(card(name)).getByText('尚未支援')).toBeTruthy();
      expect(within(card(name)).queryByRole('button')).toBeNull();
    }
  });

  it('清楚標示資料會送到所選供應商；登入只給官方說明、沒有帳密輸入欄位', async () => {
    const { transport } = fakeHelper({});
    renderPage(transport);
    await screen.findByRole('article', { name: /Claude/ });
    const notice = screen.getByRole('complementary', { name: '資料去向' });
    expect(notice.textContent).toContain('送到你選定的服務');
    expect(screen.getByRole('note').textContent).toContain('不代為輸入帳號密碼');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it.each([
    'tool_missing',
    'not_logged_in',
    'eligibility_unknown',
    'quota_exhausted',
    'unsupported',
  ] as const)('狀態 %s 不顯示模型選擇', async (state) => {
    const { transport, requests } = fakeHelper({ state });
    renderPage(transport);
    await screen.findByRole('article', { name: /Claude/ });
    expect(screen.queryByRole('group', { name: '模型' })).toBeNull();
    expect(requests.some((r) => r.op === 'providers.list_candidates')).toBe(false);
  });

  it('重新檢查送 providers.recheck 並更新卡片', async () => {
    const { transport, requests } = fakeHelper(
      {},
      {
        'providers.recheck': {
          ok: true,
          status: status({
            service: 'claude',
            state: 'tool_missing',
            checkedAt: '2026-10-10T00:00:00.000Z',
          }),
        },
      },
    );
    renderPage(transport);
    fireEvent.click(
      await within(await screen.findByRole('article', { name: /Claude/ })).findByRole('button', {
        name: '重新檢查',
      }),
    );
    await within(card(/Claude/)).findByText('工具缺少');
    expect(requests.at(-1)).toEqual({ op: 'providers.recheck', payload: { service: 'claude' } });
  });

  it('可用時列出 helper 的候選；選定只送 helper 配發的 candidateId', async () => {
    const { transport, requests } = fakeHelper({ state: 'available' });
    renderPage(transport);
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: '選定並驗證' }));
    await screen.findByText(/已驗證可用/);
    expect(requests.find((r) => r.op === 'providers.select_candidate')).toEqual({
      op: 'providers.select_candidate',
      payload: { service: 'claude', candidateId: 'c2' },
    });
    await waitFor(() => expect(screen.getByText(/目前使用：Claude Sonnet/)).toBeTruthy());
  });

  it('連不到 helper：顯示錯誤，不顯示任何可用狀態', async () => {
    renderPage(null);
    await screen.findByRole('alert');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
