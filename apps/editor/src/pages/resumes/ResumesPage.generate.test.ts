// @vitest-environment jsdom
// P1-T072：產生客製履歷後自動輪詢，出現新版本就自動顯示，不需手動重新整理。
// 等待期間不鎖整頁、可停止等待；段落編輯中不允許產生，也不會被自動切版本丟掉（對抗＋codex）。
import type { ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ResumesPage } from './ResumesPage.tsx';
import {
  GENERATED_TEXT,
  STILL_RUNNING_TEXT,
  STOPPED_TEXT,
  WAITING_TEXT,
} from './useGenerateResume.ts';
import { EDITING_BLOCKS_GENERATE_TEXT, NEW_VERSION_HELD_TEXT } from './useResumeEditor.ts';

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

/** 假 helper：送出 resume.generate 且測試呼叫 release() 之後，列版本才出現 v-2。 */
function fakeHelper() {
  const ops: string[] = [];
  let generated = false;
  let released = false;
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
          const old = { resumeVersionId: 'v-1', createdAt: T };
          const ready = generated && released;
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
  return {
    transport,
    ops,
    release: () => (released = true),
    lists: () => ops.filter((op) => op === 'resume.list').length,
  };
}

function renderPage(helper: ReturnType<typeof fakeHelper>, maxPolls = 1000) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ResumesPage, { poll: { intervalMs: 5, maxPolls } }),
    }),
  );
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const note = () => screen.getByRole('note').textContent;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function startWaiting() {
  await screen.findByText('舊版本段落');
  fireEvent.click(button('產生客製履歷'));
  await waitFor(() => expect(note()).toBe(WAITING_TEXT));
}

afterEach(cleanup);

describe('<ResumesPage /> 產生後自動顯示（P1-T072）', () => {
  it('等待期間不鎖整頁、不說「正在產生」；新版本出現就自動切過去', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startWaiting();
    expect(note()).not.toContain('正在產生');
    expect(button('等待新版本…').disabled).toBe(true);
    expect(button('重新整理').disabled).toBe(false);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '職缺' }).disabled).toBe(false);
    expect(button('接受措辭').disabled).toBe(false);
    expect(button('停止等待')).toBeTruthy();

    helper.release();
    await screen.findByText('新版本段落');
    expect(screen.queryByText('舊版本段落')).toBeNull();
    expect(note()).toBe(GENERATED_TEXT);
    expect(button('產生客製履歷').disabled).toBe(false);
    expect(screen.queryByRole('button', { name: '停止等待' })).toBeNull();
    expect(helper.ops.filter((op) => op === 'resume.generate')).toHaveLength(1);
  });

  it('停止等待：不再輪詢、可以再產生', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startWaiting();
    fireEvent.click(button('停止等待'));
    expect(note()).toBe(STOPPED_TEXT);
    expect(button('產生客製履歷').disabled).toBe(false);
    const settled = helper.lists();
    await pause(30);
    expect(helper.lists()).toBe(settled);
  });

  it('輪詢用完仍沒有新版本：停止並提示稍後重新整理', async () => {
    const helper = fakeHelper();
    renderPage(helper, 3);
    await screen.findByText('舊版本段落');
    fireEvent.click(button('產生客製履歷'));
    await waitFor(() => expect(note()).toBe(STILL_RUNNING_TEXT));
    expect(screen.getByText('舊版本段落')).toBeTruthy();
    expect(button('產生客製履歷').disabled).toBe(false);
    const settled = helper.lists();
    await pause(30);
    expect(helper.lists()).toBe(settled);
  });

  it('段落編輯中不能產生（codex）', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await screen.findByText('舊版本段落');
    fireEvent.click(button('改寫'));
    expect(screen.getByRole('form', { name: '編輯段落' })).toBeTruthy();
    expect(button('產生客製履歷').disabled).toBe(true);
    expect(screen.getByText(EDITING_BLOCKS_GENERATE_TEXT)).toBeTruthy();
    expect(helper.ops).not.toContain('resume.generate');
  });

  it('等待期間開始編輯：新版本出現時不自動切換，未存的編輯保留（codex）', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startWaiting();
    fireEvent.click(button('改寫'));
    const form = within(screen.getByRole('form', { name: '編輯段落' }));
    const box = form.getByRole<HTMLTextAreaElement>('textbox');
    fireEvent.change(box, { target: { value: '還沒存的改寫' } });

    helper.release();
    await waitFor(() => expect(note()).toBe(NEW_VERSION_HELD_TEXT));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('還沒存的改寫');
    expect(screen.queryByText('新版本段落')).toBeNull();
    const versions = screen.getByRole<HTMLSelectElement>('combobox', { name: '版本' });
    expect([...versions.options].map((o) => o.value)).toEqual(['v-2', 'v-1']);
    expect(versions.value).toBe('v-1');
  });
});
