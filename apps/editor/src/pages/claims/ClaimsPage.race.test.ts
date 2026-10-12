// @vitest-environment jsdom
import type { Claim } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ClaimsPage } from './ClaimsPage.tsx';

const claimOf = (id: string, text: string): Claim => ({
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
});

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

const PROJECTS = [
  { id: 'p1', name: '甲專案', summary: '', claimIds: [] },
  { id: 'p2', name: '乙專案', summary: '', claimIds: [] },
];

function mount(transport: BridgeTransport) {
  render(createElement(BridgeProvider, { transport, children: createElement(ClaimsPage) }));
}

afterEach(cleanup);

describe('<ClaimsPage /> 競態與失敗處理', () => {
  it('切換專案後，較慢回來的舊專案清單不會蓋掉新專案清單', async () => {
    let releaseP1 = null as (() => void) | null;
    let p1Calls = 0;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({ ok: true, projects: PROJECTS });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        if (req.op === 'claims.list' && req.payload.projectId === 'p1') {
          p1Calls += 1;
          // 第一次讀甲專案：先卡住，等乙專案顯示後才回來
          return new Promise((resolve) => {
            releaseP1 = () => resolve({ ok: true, claims: [claimOf('c1', '甲的事實')] });
          });
        }
        return Promise.resolve({ ok: true, claims: [claimOf('c2', '乙的事實')] });
      },
    };
    mount(transport);
    const select = await screen.findByRole('combobox', { name: '專案' });
    await waitFor(() => expect(p1Calls).toBe(1));
    fireEvent.change(select, { target: { value: 'p2' } });
    await screen.findByRole('article', { name: '乙的事實' });
    releaseP1?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('article', { name: '甲的事實' })).toBeNull();
    expect(screen.getByRole('article', { name: '乙的事實' })).toBeTruthy();
  });

  it('修改存檔失敗：編輯框與草稿保留', async () => {
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({ ok: true, projects: [PROJECTS[0]] });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        if (req.op === 'claims.list') {
          return Promise.resolve({ ok: true, claims: [claimOf('c1', '負責後端')] });
        }
        return Promise.resolve({
          ok: false,
          error: { code: 'invalid_request', message: '存檔失敗' },
        });
      },
    };
    mount(transport);
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '修改' }));
    fireEvent.change(within(role).getByRole('textbox'), { target: { value: '負責後端與部署' } });
    fireEvent.click(within(role).getByRole('button', { name: '儲存修改' }));
    await screen.findByText('存檔失敗');
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: '負責後端' })).getByRole<HTMLTextAreaElement>(
          'textbox',
        ).value,
      ).toBe('負責後端與部署'),
    );
  });

  it('修改存檔成功：關閉編輯框', async () => {
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({ ok: true, projects: [PROJECTS[0]] });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        if (req.op === 'claims.list') {
          return Promise.resolve({ ok: true, claims: [claimOf('c1', '負責後端')] });
        }
        return Promise.resolve({ ok: true });
      },
    };
    mount(transport);
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '修改' }));
    fireEvent.click(within(role).getByRole('button', { name: '儲存修改' }));
    await screen.findByText(/原本的確認已失效/);
    await waitFor(() =>
      expect(within(screen.getByRole('article')).queryByRole('textbox')).toBeNull(),
    );
  });

  it('存檔中：編輯框停用，不能再輸入會被丟掉的字', async () => {
    let releaseUpdate = null as (() => void) | null;
    const transport: BridgeTransport = {
      send(raw) {
        const req = raw as Sent;
        if (req.op === 'claims.list_projects') {
          return Promise.resolve({ ok: true, projects: [PROJECTS[0]] });
        }
        if (req.op === 'claims.list_unassigned') return Promise.resolve({ ok: true, claims: [] });
        if (req.op === 'claims.list') {
          return Promise.resolve({ ok: true, claims: [claimOf('c1', '負責後端')] });
        }
        return new Promise((resolve) => {
          releaseUpdate = () => resolve({ ok: true });
        });
      },
    };
    mount(transport);
    const role = await screen.findByRole('article', { name: '負責後端' });
    fireEvent.click(within(role).getByRole('button', { name: '修改' }));
    fireEvent.change(within(role).getByRole('textbox'), { target: { value: '負責後端與部署' } });
    fireEvent.click(within(role).getByRole('button', { name: '儲存修改' }));
    await waitFor(() => expect(releaseUpdate).not.toBeNull());
    expect(within(role).getByRole<HTMLTextAreaElement>('textbox').disabled).toBe(true);
    releaseUpdate?.();
  });
});
