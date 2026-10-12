// @vitest-environment jsdom
// P1-T081 codex 審查：確認姓名也要走覆寫確認（不默默蓋掉使用者的修改）；技能的「含姓名或聯絡資料」
// 標示跟著項目走（編輯、刪除前面的技能後仍在）。全部是假通道；內容為合成資料。
import type { ImportResult, ImportWebAiDraft } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const CAPTURED_AT = '2026-10-12T08:00:00.000Z';

const WEB: ImportResult = {
  status: 'web_capture',
  displayName: '網頁：104',
  platform: '104',
  capturedAt: CAPTURED_AT,
  truncated: false,
  blocks: [
    { id: 'b1', kind: 'paragraph', level: null, label: null, text: '範例科技', continues: false },
  ],
};

const f = (value: string, containsPersonalData = false) => ({
  value,
  blockId: 'b1',
  containsPersonalData,
});

const DRAFT: ImportWebAiDraft = {
  personalInfo: [{ label: '姓名', value: f('林測試') }],
  education: [],
  experiences: [],
  skills: [f('SQL'), f('林測試開發', true)],
  otherSections: [],
  discarded: [],
};

const WEB_OK = {
  ok: true,
  parse: { state: 'succeeded', failure: null, draft: null, source: 'web', webDraft: DRAFT },
};
const NAME_REQUIRED = {
  ok: false,
  error: { code: 'invalid_request', message: '請先確認姓名', reason: 'name_required' },
};

function setup(aiParse: () => unknown) {
  const replies: Record<string, (payload: unknown) => unknown> = {
    'import.latest_capture': () => ({
      ok: true,
      capture: { importId: 'web-1', platform: '104', capturedAt: CAPTURED_AT, truncated: false },
    }),
    'import.get': () => ({ ok: true, result: WEB }),
    'import.ai_parse': aiParse,
    'profile.get': () => ({ ok: true, profile: null }),
  };
  const send = vi.fn<BridgeTransport['send']>((raw) => {
    const request = raw as { op: string; payload: unknown };
    return Promise.resolve(replies[request.op]?.(request.payload));
  });
  const page = createElement(ImportPage, { aiPoll: { intervalMs: 1, maxPolls: 5 } });
  render(createElement(BridgeProvider, { transport: { send }, children: page }));
  const sent = (op: string) =>
    send.mock.calls.map(([r]) => r as { op: string; payload: unknown }).filter((r) => r.op === op);
  return { sent };
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const nameField = () => screen.getByLabelText<HTMLInputElement>('姓名');

async function openCapture() {
  fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));
  await screen.findByRole('list', { name: '擷取到的區塊' });
}

/** 有「含姓名或聯絡資料」標示的技能值。 */
const markedSkills = () =>
  screen
    .queryAllByRole('note', { name: '含姓名或聯絡資料' })
    .map((mark) => mark.closest('li')?.querySelector('input')?.value)
    .filter((value) => value !== undefined);

afterEach(cleanup);

describe('<ImportPage /> codex 審查（P1-T081）', () => {
  it('需確認姓名時先改了欄位：按確認姓名要再按一次才送出，且帶上已確認的姓名', async () => {
    let calls = 0;
    const { sent } = setup(() => (++calls === 1 ? NAME_REQUIRED : WEB_OK));
    await openCapture();
    click('用 AI 整理');
    await screen.findByRole('group', { name: '確認姓名' });
    fireEvent.change(nameField(), { target: { value: '林改過' } });
    fireEvent.change(screen.getByLabelText('姓名寫法 1'), { target: { value: '林測試' } });
    click('確認姓名並用 AI 整理');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent('import.ai_parse')).toHaveLength(1);
    expect(nameField().value).toBe('林改過');
    expect(screen.getByRole('note', { name: '覆蓋提醒' }).textContent).toContain('蓋掉');
    click('確定重新整理（放棄目前的修改）');
    await screen.findByText(/預填來源：AI 整理/u);
    expect(sent('import.ai_parse')[1]?.payload).toEqual({ importId: 'web-1', names: ['林測試'] });
    expect(nameField().value).toBe('林測試');
  });

  it('需確認姓名時沒改欄位：按一次就送出', async () => {
    let calls = 0;
    const { sent } = setup(() => (++calls === 1 ? NAME_REQUIRED : WEB_OK));
    await openCapture();
    click('用 AI 整理');
    fireEvent.change(await screen.findByLabelText('姓名寫法 1'), { target: { value: '林測試' } });
    click('確認姓名並用 AI 整理');
    await waitFor(() => expect(sent('import.ai_parse')).toHaveLength(2));
  });

  it('技能的個資標示跟著項目走：刪掉前面的技能、編輯後仍標示，新增的不標', async () => {
    setup(() => WEB_OK);
    await openCapture();
    click('用 AI 整理');
    await screen.findByText(/預填來源：AI 整理/u);
    expect(markedSkills()).toEqual(['林測試開發']);
    click('刪除技能 1');
    expect(markedSkills()).toEqual(['林測試開發']);
    fireEvent.change(screen.getByLabelText('技能 1'), { target: { value: '林測試開發工具' } });
    expect(markedSkills()).toEqual(['林測試開發工具']);
    click('新增技能');
    fireEvent.change(screen.getByLabelText('技能 2'), { target: { value: '林測試開發工具' } });
    expect(markedSkills()).toEqual(['林測試開發工具']);
  });
});
