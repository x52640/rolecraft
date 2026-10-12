// @vitest-environment jsdom
// P1-T069：選好 PDF 後自動 AI 整理、整理中鎖住表單、成功預填、失敗退回規則預填、重新整理要確認、
// 換檔與 StrictMode 時舊回應作廢。全部是假通道；內容為合成資料。
import type { ImportAiDraft, ImportResult } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const PARSED: ImportResult = {
  status: 'parsed',
  displayName: 'resume.pdf',
  pages: [{ pageNumber: 1, lines: ['姓名：林測試', '範例科技有限公司 資深工程師 2019/03 ~ 至今'] }],
  pagesWithoutText: [],
  draft: {
    name: { value: '林測試', pageNumber: 1, lineIndex: 0 },
    dates: [],
    companies: [{ value: '範例科技有限公司', pageNumber: 1, lineIndex: 1 }],
    titles: [],
    experiences: [],
    skills: [],
  },
};

const at = (value: string, lineIndex = 1) => ({ value, pageNumber: 1, lineIndex });

const DRAFT: ImportAiDraft = {
  personalInfo: [{ label: '姓名', value: at('林測試', 0) }],
  education: [],
  experiences: [
    {
      company: at('範例科技有限公司'),
      title: null,
      startDate: at('2019/03'),
      endDate: null,
      current: true,
      description: null,
    },
  ],
  skills: [at('SQL')],
  otherSections: [{ heading: at('自傳'), body: at('我是測試人物。') }],
  discarded: [{ field: '第 1 段經歷職稱', reason: 'not_in_source' }],
};

const RUNNING = { ok: true, parse: { state: 'running', failure: null, draft: null } };
const SUCCEEDED = { ok: true, parse: { state: 'succeeded', failure: null, draft: DRAFT } };
const POLL = { intervalMs: 1, maxPolls: 20 };

type Reply = object | ((payload: { importId?: string }) => unknown);

function setup(replies: Record<string, Reply[]>, strict = false) {
  const queue = new Map(Object.entries(replies));
  let picks = 0;
  const send = vi.fn<BridgeTransport['send']>((raw) => {
    const request = raw as { op: string; payload: { importId?: string } };
    if (request.op === 'import.pick_pdf') {
      picks += 1;
      const importId = `imp-${String(picks)}`;
      return Promise.resolve({
        ok: true,
        selection: { status: 'selected', importId, displayName: 'x.pdf' },
      });
    }
    if (request.op === 'import.get') return Promise.resolve({ ok: true, result: PARSED });
    const list = queue.get(request.op) ?? [];
    const next = list.length > 1 ? list.shift() : list[0];
    return Promise.resolve(
      typeof next === 'function' ? (next as (p: unknown) => unknown)(request.payload) : next,
    );
  });
  const page = createElement(ImportPage, { aiPoll: POLL });
  const tree = createElement(BridgeProvider, { transport: { send }, children: page });
  render(strict ? createElement(StrictMode, null, tree) : tree);
  const sent = (op: string) =>
    send.mock.calls.map(([r]) => r as { op: string; payload: unknown }).filter((r) => r.op === op);
  return { send, sent };
}

const nameField = () => screen.getByLabelText<HTMLInputElement>('姓名');

async function pick(label = '選擇履歷 PDF') {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await screen.findByRole('button', { name: '確認並寫入個人資料' });
}

afterEach(cleanup);

describe('<ImportPage /> AI 整理（P1-T069）', () => {
  it('選好 PDF 自動開始；整理中鎖住表單與確認；完成後預填並標示來源與略過的欄位', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => (release = resolve));
    const { sent } = setup({ 'import.ai_parse': [RUNNING], 'import.ai_status': [() => pending] });
    await pick();
    expect(sent('import.ai_parse')).toEqual([
      { op: 'import.ai_parse', payload: { importId: 'imp-1' } },
    ]);
    await screen.findByText(/AI 整理中/u);
    expect(screen.getByRole('group', { name: '校正內容' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('checkbox', { name: /我已逐欄核對/u })).toHaveProperty(
      'disabled',
      true,
    );
    release(SUCCEEDED);
    await screen.findByText(/預填來源：AI 整理/u);
    expect(screen.getByRole('group', { name: '校正內容' })).toHaveProperty('disabled', false);
    expect(screen.getByLabelText<HTMLInputElement>('第 1 段經歷開始日期').value).toBe('2019/03');
    expect(screen.getByLabelText<HTMLInputElement>('技能 1').value).toBe('SQL');
    expect(screen.getByText('AI 給的值與原文不符，已略過：')).toBeTruthy();
    expect(screen.getByRole('list', { name: '已略過的欄位' }).textContent).toContain(
      '第 1 段經歷職稱',
    );
    expect(screen.getByText('我是測試人物。')).toBeTruthy();
  });

  it('沒有選定模型（helper 拒絕）：顯示原因，保留規則預填並標明來源，表單可編輯', async () => {
    const refused = {
      ok: false,
      error: { code: 'invalid_request', message: '沒有可用的 AI 服務：請到設定頁檢查並選定模型' },
    };
    const { sent } = setup({ 'import.ai_parse': [refused] });
    await pick();
    const status = await screen.findByText(/AI 整理沒有完成/u);
    expect(status.textContent).toContain('選定模型');
    expect(status.textContent).toContain('通用規則');
    expect(nameField().value).toBe('林測試');
    expect(screen.getByRole('group', { name: '校正內容' })).toHaveProperty('disabled', false);
    expect(sent('import.ai_status')).toEqual([]);
  });

  it('整理失敗（格式不符）、helper 重開拿到 null：各自顯示原因', async () => {
    const failed = { ok: true, parse: { state: 'failed', failure: 'invalid_output', draft: null } };
    setup({ 'import.ai_parse': [RUNNING], 'import.ai_status': [failed] });
    await pick();
    expect((await screen.findByText(/AI 整理沒有完成/u)).textContent).toContain('格式不符');
    cleanup();
    setup({ 'import.ai_parse': [RUNNING], 'import.ai_status': [{ ok: true, parse: null }] });
    await pick();
    expect((await screen.findByText(/AI 整理沒有完成/u)).textContent).toContain('中斷');
  });

  it('改過欄位後「重新用 AI 整理」：要再按一次確認才送出，且會覆蓋', async () => {
    const { sent } = setup({ 'import.ai_parse': [SUCCEEDED] });
    await pick();
    await screen.findByText(/預填來源：AI 整理/u);
    fireEvent.change(nameField(), { target: { value: '林改過' } });
    fireEvent.click(screen.getByRole('button', { name: '重新用 AI 整理' }));
    expect(sent('import.ai_parse')).toHaveLength(1);
    expect(screen.getByRole('note', { name: '覆蓋提醒' }).textContent).toContain('蓋掉');
    fireEvent.click(screen.getByRole('button', { name: '確定重新整理（放棄目前的修改）' }));
    await waitFor(() => expect(sent('import.ai_parse')).toHaveLength(2));
    await waitFor(() => expect(nameField().value).toBe('林測試'));
  });

  it('換了一份檔案：上一份的整理結果晚到也不套用', async () => {
    let releaseFirst: (value: unknown) => void = () => undefined;
    const first = new Promise((resolve) => (releaseFirst = resolve));
    const refused = { ok: false, error: { code: 'not_implemented', message: 'x' } };
    setup({
      'import.ai_parse': [
        (p: { importId?: string }) => (p.importId === 'imp-1' ? RUNNING : refused),
      ],
      'import.ai_status': [() => first],
    });
    await pick();
    await screen.findByText(/AI 整理中/u);
    fireEvent.click(screen.getByRole('button', { name: '改選其他檔案' }));
    expect((await screen.findByText(/AI 整理沒有完成/u)).textContent).toContain('尚未接上');
    releaseFirst(SUCCEEDED);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/預填來源：AI 整理/u)).toBeNull();
    expect(screen.queryByLabelText('技能 1')).toBeNull();
  });

  it('StrictMode（effect 跑兩次）：只有最後一條輪詢能套用並解鎖', async () => {
    const { sent } = setup({ 'import.ai_parse': [RUNNING], 'import.ai_status': [SUCCEEDED] }, true);
    await pick();
    await screen.findByText(/預填來源：AI 整理/u);
    expect(screen.getByRole('group', { name: '校正內容' })).toHaveProperty('disabled', false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // 每次 import.ai_parse 最多對應一次狀態查詢（被作廢的那條不再輪詢）
    expect(sent('import.ai_status').length).toBeLessThanOrEqual(sent('import.ai_parse').length);
  });
});
