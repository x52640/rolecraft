// @vitest-environment jsdom
// P1-T072 codex 審查：編輯中按重新整理不丟未存編輯；讀取失敗不留下看不見的編輯狀態。
import type { ResumeVersion } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ResumesPage } from './ResumesPage.tsx';
import { EDITING_BLOCKS_GENERATE_TEXT, REFRESH_HELD_TEXT } from './useResumeEditor.ts';

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

/** 假 helper：`state.newer` 讓列版本多出 v-2；`state.getFails`／`editFails` 讓讀取／儲存失敗。 */
function fakeHelper() {
  const state = { newer: false, getFails: false, editFails: false };
  const fail = { ok: false, error: { code: 'invalid_request', message: '讀取失敗' } };
  const transport: BridgeTransport = {
    send(raw) {
      const req = raw as { op: string; payload: Record<string, unknown> };
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
          const versions = state.newer ? [{ resumeVersionId: 'v-2', createdAt: T2 }, old] : [old];
          return reply({ ok: true, versions });
        }
        case 'resume.get':
          if (state.getFails) return reply(fail);
          return reply({
            ok: true,
            version: VERSIONS[req.payload.resumeVersionId as string],
            originals: [],
          });
        case 'resume.check_export':
          return reply({ ok: true, ready: false, issues: [], blockers: [] });
        case 'resume.edit_section':
          return reply(state.editFails ? fail : { ok: true });
        default:
          return reply({ ok: true });
      }
    },
  };
  return { transport, state };
}

function renderPage(helper: ReturnType<typeof fakeHelper>) {
  render(
    createElement(BridgeProvider, {
      transport: helper.transport,
      children: createElement(ResumesPage, { poll: { intervalMs: 5, maxPolls: 3 } }),
    }),
  );
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
const editorForm = () => screen.queryByRole('form', { name: '編輯段落' });
const textbox = () => screen.getByRole<HTMLTextAreaElement>('textbox');

async function startEditing(text: string) {
  await screen.findByText('舊版本段落');
  fireEvent.click(button('改寫'));
  fireEvent.change(textbox(), { target: { value: text } });
}

/** 沒有編輯框時，不能還有「編輯中」的狀態把產生鎖住。 */
function expectNoHiddenEditing() {
  if (editorForm() !== null) return;
  expect(screen.queryByText(EDITING_BLOCKS_GENERATE_TEXT)).toBeNull();
  expect(button('產生客製履歷').disabled).toBe(false);
}

afterEach(cleanup);

describe('<ResumesPage /> 重新整理保護未存編輯（P1-T072 codex 審查）', () => {
  it('編輯中按重新整理、有新版本：保留目前版本與編輯框，提示有新版本', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startEditing('還沒存的改寫');
    helper.state.newer = true;

    fireEvent.click(button('重新整理'));
    await waitFor(() => expect(screen.getByRole('note').textContent).toBe(REFRESH_HELD_TEXT));
    expect(editorForm()).toBeTruthy();
    expect(textbox().value).toBe('還沒存的改寫');
    const versions = screen.getByRole<HTMLSelectElement>('combobox', { name: '版本' });
    expect([...versions.options].map((o) => o.value)).toEqual(['v-2', 'v-1']);
    expect(versions.value).toBe('v-1');
    expect(screen.queryByText('新版本段落')).toBeNull();
  });

  it('沒有編輯時按重新整理：照舊切到最新版本', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await screen.findByText('舊版本段落');
    helper.state.newer = true;
    fireEvent.click(button('重新整理'));
    await screen.findByText('新版本段落');
  });

  it('編輯中按重新整理、讀取失敗：不留下看不見的編輯狀態', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startEditing('還沒存的改寫');
    helper.state.getFails = true;

    fireEvent.click(button('重新整理'));
    await waitFor(() => expect(button('重新整理').disabled).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expectNoHiddenEditing();
  });

  it('儲存失敗又讀取失敗：編輯框消失時一併清掉編輯狀態', async () => {
    const helper = fakeHelper();
    renderPage(helper);
    await startEditing('還沒存的改寫');
    helper.state.editFails = true;
    helper.state.getFails = true;

    fireEvent.click(button('儲存'));
    await waitFor(() => expect(screen.getByRole('note').textContent).toBe('讀取失敗'));
    await waitFor(() => expect(screen.queryByText('舊版本段落')).toBeNull());
    expect(editorForm()).toBeNull();
    expectNoHiddenEditing();
  });
});
