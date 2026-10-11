// @vitest-environment jsdom
import type { ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ResumesPage } from './ResumesPage.tsx';

const T = '2026-10-10T08:00:00.000Z';

const versionOf = (id: string, text: string): ResumeVersion => ({
  id,
  jobSnapshotId: 'job-1',
  createdAt: T,
  sections: [
    {
      id: `${id}-s`,
      origin: 'generated',
      text,
      citations: [],
      generatedCitations: [],
      sectionConfirmation: null,
      placement: { group: 'project' },
      rationale: '理由',
      decision: 'pending',
    },
  ],
});

interface Sent {
  op: string;
  payload: Record<string, unknown>;
}

type Reply = (req: Sent) => Promise<unknown> | undefined;

/** 假 helper：resume.get 交給測試決定，其餘回固定內容。 */
function transportWith(onGet: Reply, onOther?: Reply): BridgeTransport {
  return {
    send(raw) {
      const req = raw as Sent;
      switch (req.op) {
        case 'jobs.list':
          return Promise.resolve({
            ok: true,
            snapshots: [
              {
                id: 'job-1',
                platform: '104',
                captureMethod: 'auto',
                company: '乙公司',
                title: '前端工程師',
                capturedAt: T,
                userModified: false,
                confirmedAt: T,
              },
            ],
          });
        case 'resume.list':
          return Promise.resolve({
            ok: true,
            versions: [
              { resumeVersionId: 'v-1', createdAt: '2026-10-10T08:00:00.000Z' },
              { resumeVersionId: 'v-2', createdAt: '2026-10-10T09:00:00.000Z' },
            ],
          });
        case 'resume.get':
          return onGet(req) ?? Promise.resolve({ ok: false, error: { code: 'x', message: 'x' } });
        case 'resume.check_export':
          return Promise.resolve({ ok: true, ready: false, issues: [], blockers: [] });
        default:
          return onOther?.(req) ?? Promise.resolve({ ok: true });
      }
    },
  };
}

function mount(transport: BridgeTransport) {
  render(createElement(BridgeProvider, { transport, children: createElement(ResumesPage) }));
}

afterEach(cleanup);

describe('<ResumesPage /> 競態與重新整理', () => {
  it('切換版本後，較慢回來的舊版本內容不會蓋掉新選擇', async () => {
    let releaseV1 = null as (() => void) | null;
    mount(
      transportWith((req) => {
        if (req.payload.resumeVersionId === 'v-1') {
          return new Promise((resolve) => {
            releaseV1 = () =>
              resolve({ ok: true, version: versionOf('v-1', '第一版內容'), originals: [] });
          });
        }
        return Promise.resolve({
          ok: true,
          version: versionOf('v-2', '第二版內容'),
          originals: [],
        });
      }),
    );
    const select = await screen.findByRole('combobox', { name: /^版本/ });
    await waitFor(() => expect(releaseV1).not.toBeNull());
    fireEvent.change(select, { target: { value: 'v-2' } });
    await screen.findByRole('article', { name: '第二版內容' });
    releaseV1?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('article', { name: '第一版內容' })).toBeNull();
    expect(screen.getByRole('article', { name: '第二版內容' })).toBeTruthy();
  });

  it('重新整理：選到的版本不變時也重新讀取它的內容', async () => {
    let gets = 0;
    mount(
      transportWith(() => {
        gets += 1;
        const text = gets === 1 ? '舊內容' : '新內容';
        return Promise.resolve({ ok: true, version: versionOf('v-1', text), originals: [] });
      }),
    );
    await screen.findByRole('article', { name: '舊內容' });
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await screen.findByRole('article', { name: '新內容' });
  });

  it('舊版本的寫入完成後才回來：不會讓已切換的新版本載入失效而畫面空白', async () => {
    let releaseAccept = null as (() => void) | null;
    let releaseV2 = null as (() => void) | null;
    mount(
      transportWith(
        (req) => {
          if (req.payload.resumeVersionId === 'v-2') {
            return new Promise((resolve) => {
              releaseV2 = () =>
                resolve({ ok: true, version: versionOf('v-2', '第二版內容'), originals: [] });
            });
          }
          return Promise.resolve({
            ok: true,
            version: versionOf('v-1', '第一版內容'),
            originals: [],
          });
        },
        (req) => {
          if (req.op !== 'resume.accept_section') return undefined;
          return new Promise((resolve) => {
            releaseAccept = () => resolve({ ok: true });
          });
        },
      ),
    );
    const card = await screen.findByRole('article', { name: '第一版內容' });
    fireEvent.click(within(card).getByRole('button', { name: '接受措辭' }));
    await waitFor(() => expect(releaseAccept).not.toBeNull());
    fireEvent.change(screen.getByRole('combobox', { name: /^版本/ }), {
      target: { value: 'v-2' },
    });
    await waitFor(() => expect(releaseV2).not.toBeNull());
    releaseAccept?.();
    await new Promise((r) => setTimeout(r, 0));
    releaseV2?.();
    await screen.findByRole('article', { name: '第二版內容' });
    expect(screen.queryByRole('article', { name: '第一版內容' })).toBeNull();
  });
});
