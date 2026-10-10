// @vitest-environment jsdom
import type { ApplicationRecord, ExportVersionSummary } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ApplicationsPage } from './ApplicationsPage.tsx';
import { appliedVersionCount, dateToTimestamp, timestampToDate } from './model.ts';

const EV1 = 'ev-1';
const EV2 = 'ev-2';
const version = (id: string, company: string): ExportVersionSummary => ({
  exportVersionId: id,
  resumeVersionId: `rv-${id}`,
  jobSnapshotId: `js-${id}`,
  company,
  title: '前端工程師',
  exportedAt: '2026-10-09T02:00:00.000Z',
  pdfHash: 'a'.repeat(64),
  pdfBytes: 1000,
});
const record = (id: string, exportVersionId: string): ApplicationRecord => ({
  id,
  initiation: 'proactive',
  appliedAt: dateToTimestamp('2026-10-09') ?? '',
  status: '已投遞',
  exportVersionId,
});

interface Setup {
  applications?: ApplicationRecord[];
  versions?: ExportVersionSummary[] | 'fail';
  mutation?: unknown;
}

function setup({ applications = [], versions = [], mutation = { ok: true } }: Setup = {}) {
  const sent: { op: string; payload: unknown }[] = [];
  const send = vi.fn<BridgeTransport['send']>((request) => {
    const { op, payload } = request as { op: string; payload: unknown };
    sent.push({ op, payload });
    if (op === 'applications.list') return Promise.resolve({ ok: true, applications });
    if (op === 'export.list_versions') {
      return Promise.resolve(
        versions === 'fail'
          ? { ok: false, error: { code: 'not_implemented', message: '此操作尚未支援' } }
          : { ok: true, versions },
      );
    }
    if (op === 'applications.create') return Promise.resolve({ ok: true, applicationId: 'new' });
    return Promise.resolve(mutation);
  });
  render(
    <BridgeProvider transport={{ send }}>
      <ApplicationsPage />
    </BridgeProvider>,
  );
  const mutations = () => sent.filter((s) => !s.op.endsWith('list') && !s.op.endsWith('versions'));
  return { sent, mutations };
}

afterEach(cleanup);

describe('model', () => {
  it('日期與時間戳記互換（當地日期）', () => {
    const ts = dateToTimestamp('2026-02-28');
    expect(ts && timestampToDate(ts)).toBe('2026-02-28');
    expect(dateToTimestamp('2026-02-30')).toBeNull();
    expect(dateToTimestamp('')).toBeNull();
  });

  it('已投遞版本數不重複計算', () => {
    expect(appliedVersionCount([record('a', EV1), record('b', EV1), record('c', EV2)])).toBe(2);
  });
});

describe('ApplicationsPage（P1-T028）', () => {
  it('列出投遞紀錄與實際投出版本，並顯示刪除素材時保留的已投遞版本數（D19）', async () => {
    setup({
      applications: [record('a', EV1), record('b', EV1), record('c', EV2)],
      versions: [version(EV1, '甲公司'), version(EV2, '乙公司')],
    });
    const list = await screen.findByRole('list', { name: '投遞紀錄' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list.textContent).toContain('甲公司');
    expect(screen.getByLabelText('已投遞版本數').textContent).toContain('2 份');
  });

  it('新增：實際投出只能從匯出版本選；送出的是記錄操作，沒有投遞', async () => {
    const { mutations } = setup({ versions: [version(EV1, '甲公司')] });
    const form = await screen.findByRole('form', { name: '新增投遞紀錄' });
    const select = within(form).getByRole('combobox', { name: '實際投出版本' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['', EV1]);

    // 繞過瀏覽器的 required 檢查，確認表單自己也擋
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveProperty(
      'textContent',
      '請選實際投出的匯出版本',
    );
    expect(mutations()).toEqual([]);

    fireEvent.change(select, { target: { value: EV1 } });
    fireEvent.click(within(form).getByRole('radio', { name: '對方邀約' }));
    fireEvent.click(within(form).getByRole('button', { name: '記錄投遞' }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]).toMatchObject({
      op: 'applications.create',
      payload: { initiation: 'invited', status: '已投遞', exportVersionId: EV1 },
    });
  });

  it('還沒有匯出版本：不顯示新增表單', async () => {
    setup();
    expect(await screen.findByText(/還沒有匯出版本/)).toBeTruthy();
    expect(screen.queryByRole('form', { name: '新增投遞紀錄' })).toBeNull();
  });

  it('匯出版本讀取失敗：不能新增', async () => {
    setup({ versions: 'fail' });
    expect((await screen.findByRole('alert')).textContent).toContain('暫時不能新增');
    expect(screen.queryByRole('form', { name: '新增投遞紀錄' })).toBeNull();
  });

  it('修改：實際投出版本不能改，送出原本的版本', async () => {
    const { mutations } = setup({
      applications: [record('a', EV1)],
      versions: [version(EV1, '甲公司'), version(EV2, '乙公司')],
    });
    fireEvent.click(await screen.findByRole('button', { name: '修改' }));
    const form = screen.getByRole('form', { name: /^修改/ });
    expect(within(form).queryByRole('combobox', { name: '實際投出版本' })).toBeNull();
    fireEvent.change(within(form).getByRole('combobox', { name: '狀態' }), {
      target: { value: '面試中' },
    });
    fireEvent.click(within(form).getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]).toMatchObject({
      op: 'applications.update',
      payload: { applicationId: 'a', status: '面試中', exportVersionId: EV1 },
    });
  });

  it('刪除要再確認一次；helper 拒絕時顯示原因', async () => {
    const { mutations } = setup({
      applications: [record('a', EV1)],
      versions: [version(EV1, '甲公司')],
      mutation: { ok: false, error: { code: 'invalid_request', message: '找不到這筆投遞紀錄' } },
    });
    fireEvent.click(await screen.findByRole('button', { name: '刪除' }));
    expect(mutations()).toEqual([]);
    const confirm = screen.getByRole('group', { name: '確認刪除' });
    fireEvent.click(within(confirm).getByRole('button', { name: '確認刪除' }));
    expect((await screen.findByRole('alert')).textContent).toBe('找不到這筆投遞紀錄');
    expect(mutations()).toEqual([{ op: 'applications.delete', payload: { applicationId: 'a' } }]);
  });
});
