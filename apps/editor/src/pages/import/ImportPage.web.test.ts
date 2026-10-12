// @vitest-environment jsdom
// P1-T081：匯入頁的網頁擷取與手動輸入。計費高風險（D28 Q4＝B）：網頁來源只有按「用 AI 整理」才送
// import.ai_parse；擷取查詢、開啟、重新開啟、切換、StrictMode 都不送。全部是假通道；內容為合成資料。
import type { ImportResult, ImportWebAiDraft } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const CAPTURE = { importId: 'web-1', platform: '104', capturedAt: '2026-10-12T08:00:00.000Z' };

const WEB: ImportResult = {
  status: 'web_capture',
  displayName: '網頁：104',
  platform: '104',
  capturedAt: CAPTURE.capturedAt,
  truncated: true,
  blocks: [
    { id: 'b1', kind: 'heading', level: 2, label: null, text: '工作經驗', continues: false },
    { id: 'b2', kind: 'paragraph', level: null, label: null, text: '範例科技', continues: false },
    { id: 'b3', kind: 'label_value', level: null, label: '職稱', text: '工程師', continues: false },
  ],
};

const PDF: ImportResult = {
  status: 'parsed',
  displayName: 'resume.pdf',
  pages: [{ pageNumber: 1, lines: ['範例科技'] }],
  pagesWithoutText: [],
  draft: { name: null, dates: [], companies: [], titles: [], experiences: [], skills: [] },
};

const f = (value: string, blockId: string, containsPersonalData = false) => ({
  value,
  blockId,
  containsPersonalData,
});

const WEB_DRAFT: ImportWebAiDraft = {
  personalInfo: [{ label: '姓名', value: f('林測試', 'b2') }],
  education: [],
  experiences: [
    {
      company: f('範例科技', 'b2'),
      title: f('工程師', 'b3'),
      startDate: null,
      endDate: null,
      current: false,
      description: f('與林測試一起完成專案', 'b2', true),
    },
  ],
  skills: [f('SQL', 'b3')],
  otherSections: [],
  discarded: [],
};

const WEB_OK = {
  ok: true,
  parse: { state: 'succeeded', failure: null, draft: null, source: 'web', webDraft: WEB_DRAFT },
};
const NAME_REQUIRED = {
  ok: false,
  error: { code: 'invalid_request', message: '請先確認姓名', reason: 'name_required' },
};
const PROFILE = {
  ok: true,
  profile: {
    id: 'p-1',
    personalInfo: { 姓名: '林測試' },
    experiences: [],
    skills: [],
    pdfParseConfirmed: true,
  },
};

type Reply = object | ((payload: { importId?: string }) => unknown);

function setup(overrides: Record<string, Reply> = {}, strict = false) {
  const replies: Record<string, Reply> = {
    'import.latest_capture': { ok: true, capture: { ...CAPTURE, truncated: true } },
    'import.get': (p: { importId?: string }) => ({
      ok: true,
      result: p.importId === 'pdf-1' ? PDF : WEB,
    }),
    'import.pick_pdf': {
      ok: true,
      selection: { status: 'selected', importId: 'pdf-1', displayName: 'resume.pdf' },
    },
    'import.ai_parse': WEB_OK,
    'import.start_manual': { ok: true, importId: 'man-1' },
    'import.confirm': { ok: true, profileId: 'p-1' },
    'profile.get': PROFILE,
    ...overrides,
  };
  const send = vi.fn<BridgeTransport['send']>((raw) => {
    const request = raw as { op: string; payload: { importId?: string } };
    const reply = replies[request.op];
    return Promise.resolve(
      typeof reply === 'function'
        ? (reply as (p: { importId?: string }) => unknown)(request.payload)
        : reply,
    );
  });
  const page = createElement(ImportPage, { aiPoll: { intervalMs: 1, maxPolls: 5 } });
  const tree = createElement(BridgeProvider, { transport: { send }, children: page });
  render(strict ? createElement(StrictMode, null, tree) : tree);
  const sent = (op: string) =>
    send.mock.calls.map(([r]) => r as { op: string; payload: unknown }).filter((r) => r.op === op);
  return { sent };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

async function openCapture() {
  fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));
  await screen.findByRole('button', { name: '查看擷取原文' });
}

afterEach(cleanup);

describe('<ImportPage /> 網頁擷取（P1-T081）', () => {
  it('顯示最近一次擷取（平台、時間、截斷）；查詢與重新查詢都不送 AI、不開啟核對', async () => {
    const { sent } = setup();
    const panel = await screen.findByRole('region', { name: '最近一次網頁擷取' });
    await screen.findByRole('button', { name: '使用這份' });
    expect(panel.textContent).toContain('104');
    expect(screen.getByRole('note', { name: '擷取不完整' })).toBeTruthy();
    click('重新查詢');
    await screen.findByRole('button', { name: '使用這份' });
    await settle();
    expect(sent('import.latest_capture')).toHaveLength(2);
    expect(sent('import.get')).toEqual([]);
    expect(sent('import.ai_parse')).toEqual([]);
  });

  it('核對中查到新的擷取：只更新擷取區塊，正在核對的內容與表單不變、不送 AI', async () => {
    let n = 0;
    const { sent } = setup({
      'import.latest_capture': () => ({
        ok: true,
        capture: { ...CAPTURE, importId: `web-${String(++n)}`, truncated: false },
      }),
    });
    await openCapture();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '林測試' } });
    click('重新查詢');
    await waitFor(() => expect(sent('import.latest_capture')).toHaveLength(2));
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>('姓名').value).toBe('林測試');
    expect(sent('import.get')).toHaveLength(1);
    expect(sent('import.ai_parse')).toEqual([]);
  });

  it('「使用這份」只開啟核對：原文預設收合、持續的「內容不完整」，不送 AI；按「用 AI 整理」才送一次', async () => {
    const { sent } = setup();
    await openCapture();
    expect(sent('import.get')).toEqual([{ op: 'import.get', payload: { importId: 'web-1' } }]);
    expect(screen.queryByRole('group', { name: '擷取原文內容' })).toBeNull();
    expect(screen.getByRole('note', { name: '內容不完整' })).toBeTruthy();
    expect(screen.queryByText(/第 1 頁/u)).toBeNull();
    await settle();
    expect(sent('import.ai_parse')).toEqual([]);
    click('用 AI 整理');
    await screen.findByText(/預填來源：AI 整理/u);
    expect(sent('import.ai_parse')).toEqual([
      { op: 'import.ai_parse', payload: { importId: 'web-1' } },
    ]);
    expect(screen.getByRole('note', { name: '內容不完整' })).toBeTruthy();
  });

  it('StrictMode：重新開啟同一份擷取、切到 PDF 再切回網頁，網頁都不送 AI（只有 PDF 自動整理）', async () => {
    const { sent } = setup(
      { 'import.ai_parse': { ok: false, error: { code: 'not_implemented', message: 'x' } } },
      true,
    );
    await openCapture();
    click('使用這份');
    await screen.findByRole('button', { name: '查看擷取原文' });
    await settle();
    expect(sent('import.ai_parse')).toEqual([]);
    click('改選履歷 PDF');
    await screen.findByRole('button', { name: '改選其他檔案' });
    await waitFor(() => expect(sent('import.ai_parse').length).toBeGreaterThan(0));
    const pdfCalls = sent('import.ai_parse').length;
    expect(
      sent('import.ai_parse').every(
        (r) => (r.payload as { importId: string }).importId === 'pdf-1',
      ),
    ).toBe(true);
    click('使用這份');
    await screen.findByRole('button', { name: '查看擷取原文' });
    await settle();
    expect(sent('import.ai_parse')).toHaveLength(pdfCalls);
  });

  it('helper 回需確認姓名：顯示預填既有姓名的輸入、可加寫法；確認後才帶姓名送出', async () => {
    let calls = 0;
    const { sent } = setup({
      'import.ai_parse': () => (++calls === 1 ? NAME_REQUIRED : WEB_OK),
    });
    await openCapture();
    click('用 AI 整理');
    await screen.findByRole('group', { name: '確認姓名' });
    const first = await screen.findByDisplayValue('林測試');
    expect(first.getAttribute('id')).toBeTruthy();
    expect(sent('import.ai_parse')).toHaveLength(1);
    fireEvent.change(first, { target: { value: ' ' } });
    click('確認姓名並用 AI 整理');
    expect((await screen.findByRole('alert')).textContent).toContain('至少填一個');
    expect(sent('import.ai_parse')).toHaveLength(1);
    fireEvent.change(first, { target: { value: '林測試' } });
    click('加一個寫法');
    fireEvent.change(screen.getByLabelText('姓名寫法 2'), { target: { value: 'Alex Lin' } });
    click('確認姓名並用 AI 整理');
    await screen.findByText(/預填來源：AI 整理/u);
    expect(sent('import.ai_parse')[1]?.payload).toEqual({
      importId: 'web-1',
      names: ['林測試', 'Alex Lin'],
    });
  });

  it('還原出姓名或聯絡資料的欄位標示「含姓名或聯絡資料」，只標在那一欄', async () => {
    setup();
    await openCapture();
    click('用 AI 整理');
    await screen.findByText(/預填來源：AI 整理/u);
    expect(screen.getByLabelText<HTMLTextAreaElement>('第 1 段經歷描述').value).toBe(
      '與林測試一起完成專案',
    );
    const marks = screen.getAllByRole('note', { name: '含姓名或聯絡資料' });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.closest('label')?.textContent).toContain('描述');
  });

  it('AI 失敗：說明原因，區塊仍在可對照手動輸入，表單可編輯', async () => {
    const failed = {
      ok: true,
      parse: {
        state: 'failed',
        failure: 'provider_error',
        draft: null,
        source: 'web',
        webDraft: null,
      },
    };
    setup({ 'import.ai_parse': failed });
    await openCapture();
    click('用 AI 整理');
    const status = await screen.findByText(/AI 整理沒有完成/u);
    expect(status.textContent).toContain('區塊手動輸入');
    expect(screen.getByRole('button', { name: '查看擷取原文' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '校正內容' })).toHaveProperty('disabled', false);
  });
});

describe('<ImportPage /> 手動輸入與確認（P1-T081）', () => {
  it('一開始就有「手動輸入」：建立沒有原文的工作階段並可確認；確認列明示會取代個人資料', async () => {
    const { sent } = setup({ 'import.latest_capture': { ok: true, capture: null } });
    expect((await screen.findByText(/還沒有擷取/u)).textContent).toContain('重新查詢');
    click('手動輸入');
    await screen.findByText(/手動輸入：沒有原文/u);
    expect(sent('import.start_manual')).toEqual([{ op: 'import.start_manual', payload: {} }]);
    expect(screen.queryByRole('region', { name: 'AI 整理' })).toBeNull();
    expect(screen.getByRole('note', { name: '取代提醒' }).textContent).toContain(
      '會取代目前的個人資料',
    );
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '林測試' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    click('確認並寫入個人資料');
    await screen.findByText(/已確認並寫入個人資料（來源：手動輸入）/u);
    expect(sent('import.confirm')[0]?.payload).toEqual({
      importId: 'man-1',
      profile: { personalInfo: { 姓名: '林測試' }, experiences: [], skills: [] },
    });
    expect(sent('import.ai_parse')).toEqual([]);
  });

  it('核對網頁擷取時也有「手動輸入」；helper 回多份個人資料時顯示原因、不離開核對', async () => {
    const multiple = {
      ok: false,
      error: { code: 'invalid_request', message: 'x', reason: 'multiple_profiles' },
    };
    setup({ 'import.confirm': multiple });
    await openCapture();
    expect(screen.getByRole('button', { name: '手動輸入' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '林測試' } });
    click('確認並寫入個人資料');
    expect((await screen.findByRole('alert')).textContent).toContain('多份個人資料');
    expect(screen.getByRole('button', { name: '查看擷取原文' })).toBeTruthy();
  });

  it('查不到最近擷取（helper 沒開）：只在擷取區塊提示，不出現錯誤警示', async () => {
    setup({
      'import.latest_capture': { ok: false, error: { code: 'helper_unavailable', message: 'x' } },
    });
    await screen.findByText(/查不到最近的擷取/u);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
