// @vitest-environment jsdom
import type { SourceEntry, SourceRootView } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ProjectsPage } from './ProjectsPage.tsx';

afterEach(cleanup);

interface FakeFolder {
  view: SourceRootView;
  entries: SourceEntry[];
}

function doc(entryId: string, name: string, parent: string | null, suggested = false): SourceEntry {
  return {
    entryId,
    parentEntryId: parent,
    name,
    kind: 'document',
    sizeBytes: 2048,
    format: 'md',
    authorization: 'pending',
    suggested,
  };
}

/** 假的 helper：只認 sources.*，記下收到的請求。picks 依序是每次選取器的結果。 */
function fakeHelper(picks: FakeFolder[][]) {
  const folders: FakeFolder[] = [];
  const sent: { op: string; payload: Record<string, unknown> }[] = [];
  const transport: BridgeTransport = {
    send(raw) {
      const request = raw as { op: string; payload: Record<string, unknown> };
      sent.push(request);
      const find = () => folders.find((f) => f.view.rootId === request.payload.rootId);
      const count = (f: FakeFolder) => ({
        ...f.view,
        pendingCount: f.entries.filter((e) => e.authorization === 'pending').length,
        authorizedCount: f.entries.filter((e) => e.authorization === 'authorized').length,
      });
      switch (request.op) {
        case 'sources.pick_folders': {
          const batch = picks.shift() ?? [];
          if (batch.length === 0)
            return Promise.resolve({ ok: true, selection: { status: 'cancelled' } });
          folders.push(...batch);
          const roots = batch.map((f) => ({ rootId: f.view.rootId, name: f.view.name }));
          return Promise.resolve({ ok: true, selection: { status: 'selected', roots } });
        }
        case 'sources.list_folders':
          return Promise.resolve({ ok: true, roots: folders.map(count) });
        case 'sources.preview':
          return Promise.resolve({ ok: true, entries: find()?.entries ?? [] });
        case 'sources.update_authorization': {
          const folder = find();
          const { authorize, revoke } = request.payload as {
            authorize: string[];
            revoke: string[];
          };
          for (const e of folder?.entries ?? []) {
            if (authorize.includes(e.entryId)) e.authorization = 'authorized';
            if (revoke.includes(e.entryId)) e.authorization = 'revoked';
          }
          return Promise.resolve({ ok: true });
        }
        case 'sources.remove_folder': {
          const i = folders.findIndex((f) => f.view.rootId === request.payload.rootId);
          folders.splice(i, 1);
          return Promise.resolve({ ok: true });
        }
        default:
          return Promise.resolve({ ok: false, error: { code: 'not_implemented', message: 'x' } });
      }
    },
  };
  return { transport, sent, folders };
}

function folder(rootId: string, name: string): FakeFolder {
  return {
    view: { rootId, name, pendingCount: 0, authorizedCount: 0 },
    entries: [
      {
        ...doc(`${rootId}-d`, 'docs', null),
        kind: 'container',
        sizeBytes: null,
        format: '',
        authorization: null,
      },
      doc(`${rootId}-readme`, 'README.md', null, true),
      doc(`${rootId}-notes`, 'notes.md', `${rootId}-d`),
    ],
  };
}

function renderPage(transport: BridgeTransport) {
  return render(
    <BridgeProvider transport={transport}>
      <ProjectsPage />
    </BridgeProvider>,
  );
}

describe('<ProjectsPage />', () => {
  it('連續新增資料夾累積清單；請求不帶任何路徑', async () => {
    const helper = fakeHelper([
      [folder('a', 'alpha')],
      [],
      [folder('b', 'beta'), folder('c', 'gamma')],
    ]);
    renderPage(helper.transport);
    await screen.findByText('還沒有加入任何資料夾。');
    const add = screen.getByRole('button', { name: '新增資料夾' });
    fireEvent.click(add);
    await screen.findByText('alpha');
    fireEvent.click(add); // 取消
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(add);
    await screen.findByText('gamma');
    const list = screen.getByRole('list', { name: '已加入的資料夾' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const picks = helper.sent.filter((r) => r.op === 'sources.pick_folders');
    expect(picks.every((r) => JSON.stringify(r.payload) === '{}')).toBe(true);
  });

  it('預覽：待確認不預先勾選；勾選後確認才送授權，沒勾的記為不納入', async () => {
    const helper = fakeHelper([[folder('a', 'alpha')]]);
    renderPage(helper.transport);
    fireEvent.click(await screen.findByRole('button', { name: '新增資料夾' }));
    const preview = await screen.findByRole('region', { name: '預覽：alpha' });
    await within(preview).findByText(/有 2 個文件待確認/);
    const readme = within(preview).getByRole('checkbox', { name: 'README.md（建議）' });
    expect((readme as HTMLInputElement).checked).toBe(false);
    expect(helper.sent.some((r) => r.op === 'sources.update_authorization')).toBe(false);

    fireEvent.click(within(preview).getByRole('button', { name: '勾選建議文件' }));
    expect((readme as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(preview).getByRole('button', { name: '確認' }));
    await within(preview).findByText(/已更新授權/);

    const updates = helper.sent.filter((r) => r.op === 'sources.update_authorization');
    expect(updates.map((r) => r.payload)).toEqual([
      { rootId: 'a', authorize: [], revoke: ['a-notes'] },
      { rootId: 'a', authorize: ['a-readme'], revoke: [] },
    ]);
    await screen.findByText(/待確認 0・已授權 1/);
  });

  it('勾子資料夾等於勾它底下全部文件', async () => {
    const helper = fakeHelper([[folder('a', 'alpha')]]);
    renderPage(helper.transport);
    fireEvent.click(await screen.findByRole('button', { name: '新增資料夾' }));
    const preview = await screen.findByRole('region', { name: '預覽：alpha' });
    fireEvent.click(await within(preview).findByRole('checkbox', { name: 'docs/' }));
    const notes = within(preview).getByRole<HTMLInputElement>('checkbox', { name: 'notes.md' });
    expect(notes.checked).toBe(true);
  });

  it('移除資料夾後從清單消失', async () => {
    const helper = fakeHelper([[folder('a', 'alpha')]]);
    renderPage(helper.transport);
    fireEvent.click(await screen.findByRole('button', { name: '新增資料夾' }));
    fireEvent.click(await screen.findByRole('button', { name: '移除 alpha' }));
    await screen.findByText('還沒有加入任何資料夾。');
    expect(screen.queryByRole('region', { name: '預覽：alpha' })).toBeNull();
  });

  it('helper 未支援選取器時顯示錯誤，不偽造成功', async () => {
    const transport: BridgeTransport = {
      send: (raw) =>
        Promise.resolve(
          (raw as { op: string }).op === 'sources.list_folders'
            ? { ok: true, roots: [] }
            : { ok: false, error: { code: 'not_implemented', message: '此操作尚未支援' } },
        ),
    };
    renderPage(transport);
    fireEvent.click(await screen.findByRole('button', { name: '新增資料夾' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('尚未支援');
    });
  });
});
