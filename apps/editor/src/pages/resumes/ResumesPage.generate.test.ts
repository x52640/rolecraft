// @vitest-environment jsdom
// P1-T072：產生客製履歷後自動輪詢，出現新版本就自動顯示，不需手動重新整理；產生期間鎖住操作。
import type { ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ResumesPage } from './ResumesPage.tsx';
import { GENERATED_TEXT, STILL_RUNNING_TEXT } from './useGenerateResume.ts';

const T = '2026-10-10T08:00:00.000Z';
const T2 = '2026-10-10T09:00:00.000Z';

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

const VERSIONS: Record<string, ResumeVersion> = {
  'v-1': versionOf('v-1', '舊版本段落'),
  'v-2': versionOf('v-2', '新版本段落'),
};

/** 假 helper：送出 resume.generate 後，第 readyAfter 次列版本才出現 v-2（readyAfter 為 null 表示一直沒出現）。 */
function fakeHelper(readyAfter: number | null) {
  const ops: string[] = [];
  let generated = false;
  let listsAfterGenerate = 0;
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as { op: string; payload: Record<string, unknown> };
      ops.push(req.op);
      const reply = (value: unknown) => Promise.resolve(value);
      switch (req.op) {
        case 'jobs.list':
          return reply({
            ok: true,
            snapshots: [
              {
                id: 'job-1',
                platform: '104',
                captureMethod: 'auto',
                company: '乙公司',
                title: 'AI 客戶成功經理',
                capturedAt: T,
                userModified: false,
                confirmedAt: T,
              },
            ],
          });
        case 'resume.list': {
          if (generated) listsAfterGenerate += 1;
          const ready = readyAfter !== null && generated && listsAfterGenerate > readyAfter;
          const old = { resumeVersionId: 'v-1', createdAt: T };
          return reply({
            ok: true,
            versions: ready ? [{ resumeVersionId: 'v-2', createdAt: T2 }, old] : [old],
          });
        }
        case 'resume.get':
          return reply({
            ok: true,
            version: VERSIONS[req.payload.resumeVersionId as string],
            originals: [],
          });
        case 'resume.check_export':
          return reply({ ok: true, ready: false, issues: [], blockers: [] });
        case 'resume.generate':
          generated = true;
          return reply({ ok: true, workJobId: 'w-1' });
        default:
          return reply({ ok: true });
      }
    },
  };
  return { transport, ops };
}

function renderPage(helper: ReturnType<typeof fakeHelper>, maxPolls = 10) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ResumesPage, { poll: { intervalMs: 5, maxPolls } }),
    }),
  );
}

afterEach(cleanup);

describe('<ResumesPage /> 產生後自動顯示（P1-T072）', () => {
  it('產生完成後自動切到新版本，不用按重新整理；產生期間鎖住操作', async () => {
    const helper = fakeHelper(2);
    renderPage(helper);
    await screen.findByText('舊版本段落');
    fireEvent.click(screen.getByRole('button', { name: '產生客製履歷' }));

    const generating = await screen.findByRole<HTMLButtonElement>('button', { name: '產生中…' });
    expect(generating.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '重新整理' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '職缺' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '接受措辭' }).disabled).toBe(true);

    await screen.findByText('新版本段落');
    expect(screen.queryByText('舊版本段落')).toBeNull();
    expect(screen.getByRole('note').textContent).toBe(GENERATED_TEXT);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: '產生客製履歷' });
    expect(button.disabled).toBe(false);
    expect(helper.ops.filter((op) => op === 'resume.generate')).toHaveLength(1);
  });

  it('輪詢用完仍沒有新版本：停止並提示稍後重新整理，解除鎖定', async () => {
    const helper = fakeHelper(null);
    renderPage(helper, 3);
    await screen.findByText('舊版本段落');
    fireEvent.click(screen.getByRole('button', { name: '產生客製履歷' }));
    await waitFor(() => expect(screen.getByRole('note').textContent).toBe(STILL_RUNNING_TEXT));
    expect(screen.getByText('舊版本段落')).toBeTruthy();
    const button = screen.getByRole<HTMLButtonElement>('button', { name: '產生客製履歷' });
    expect(button.disabled).toBe(false);
    // 送出前一次＋最多 3 次輪詢；之後不再輪詢
    const lists = () => helper.ops.filter((op) => op === 'resume.list').length;
    const settled = lists();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lists()).toBe(settled);
  });
});
