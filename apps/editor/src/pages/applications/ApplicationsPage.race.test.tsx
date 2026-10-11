// @vitest-environment jsdom
import type { ApplicationRecord, ExportVersionSummary } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ApplicationsPage } from './ApplicationsPage.tsx';
import { versionLabel } from './model.ts';

const version = (id: string): ExportVersionSummary => ({
  exportVersionId: id,
  resumeVersionId: `rv-${id}`,
  jobSnapshotId: 'js-1',
  company: '甲公司',
  title: '前端工程師',
  exportedAt: '2026-10-09T02:00:00.000Z',
  pdfHash: 'a'.repeat(64),
  pdfBytes: 1000,
});

const record = (id: string, status: string, appliedAt: string): ApplicationRecord => ({
  id,
  initiation: 'proactive',
  appliedAt,
  status,
  exportVersionId: 'ev-aaaaaa',
});

const NOON = '2026-10-09T04:00:00.000Z';

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

function mount(send: BridgeTransport['send']) {
  render(
    <BridgeProvider transport={{ send }}>
      <ApplicationsPage />
    </BridgeProvider>,
  );
}

afterEach(cleanup);

describe('投遞紀錄頁：標籤、競態、日期', () => {
  it('同一分鐘匯出的兩個版本，標籤仍可區分（帶短 ID）', () => {
    const a = versionLabel(version('export-111111'));
    const b = versionLabel(version('export-222222'));
    expect(a).not.toBe(b);
    expect(a).toContain('111111');
  });

  it('兩筆修改重疊：較舊的重新讀取晚回來也不會蓋掉較新的結果', async () => {
    let lists = 0;
    let releaseStale = null as (() => void) | null;
    const send: BridgeTransport['send'] = (raw) => {
      const req = raw as Sent;
      if (req.op === 'export.list_versions') {
        return Promise.resolve({ ok: true, versions: [version('ev-aaaaaa')] });
      }
      if (req.op === 'applications.list') {
        lists += 1;
        if (lists === 1) {
          return Promise.resolve({
            ok: true,
            applications: [record('a', '甲原狀態', NOON), record('b', '乙原狀態', NOON)],
          });
        }
        if (lists === 2) {
          // 第一筆修改後的讀取：卡住，等第二筆修改的讀取套用後才回來（內容較舊）
          return new Promise((resolve) => {
            releaseStale = () =>
              resolve({
                ok: true,
                applications: [record('a', '甲新狀態', NOON), record('b', '乙原狀態', NOON)],
              });
          });
        }
        return Promise.resolve({
          ok: true,
          applications: [record('a', '甲新狀態', NOON), record('b', '乙新狀態', NOON)],
        });
      }
      return Promise.resolve({ ok: true });
    };
    mount(send);
    const list = await screen.findByRole('list', { name: '投遞紀錄' });
    await waitFor(() => expect(list.textContent).toContain('乙原狀態'));
    const save = (index: number, status: string) => {
      fireEvent.click(screen.getAllByRole('button', { name: '修改' })[index] as HTMLElement);
      // 第一列的表單在讀取完成前仍開著，新開的表單是最後一個
      const form = screen.getAllByRole('form', { name: /^修改/ }).at(-1) as HTMLElement;
      fireEvent.change(within(form).getByRole('combobox', { name: '狀態' }), {
        target: { value: status },
      });
      fireEvent.click(within(form).getByRole('button', { name: '儲存' }));
    };
    save(0, '甲新狀態');
    await waitFor(() => expect(releaseStale).not.toBeNull());
    save(0, '乙新狀態'); // 第一列已在編輯中，剩下的「修改」按鈕屬於第二列
    await waitFor(() => expect(list.textContent).toContain('乙新狀態'));
    releaseStale?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(list.textContent).toContain('乙新狀態');
  });

  it('只改狀態：送回原本的投遞時間戳記（不因時區重算日期）', async () => {
    // 不是當地正午的時間戳記，模擬在其他時區建立的紀錄
    const original = '2026-10-09T23:30:00.000Z';
    const sent: Sent[] = [];
    const send: BridgeTransport['send'] = (raw) => {
      const req = raw as Sent;
      sent.push(req);
      if (req.op === 'export.list_versions') {
        return Promise.resolve({ ok: true, versions: [version('ev-aaaaaa')] });
      }
      if (req.op === 'applications.list') {
        return Promise.resolve({ ok: true, applications: [record('a', '已投遞', original)] });
      }
      return Promise.resolve({ ok: true });
    };
    mount(send);
    fireEvent.click(await screen.findByRole('button', { name: '修改' }));
    const form = screen.getByRole('form', { name: /^修改/ });
    fireEvent.change(within(form).getByRole('combobox', { name: '狀態' }), {
      target: { value: '面試中' },
    });
    fireEvent.click(within(form).getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(sent.some((s) => s.op === 'applications.update')).toBe(true));
    expect(sent.find((s) => s.op === 'applications.update')?.payload).toMatchObject({
      appliedAt: original,
      status: '面試中',
    });
  });
});
