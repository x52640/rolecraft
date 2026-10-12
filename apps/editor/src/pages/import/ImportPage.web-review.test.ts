// @vitest-environment jsdom
// P1-T089：網頁來源的核對（D29；確認流程照擁有者 2026-10-13 再裁定：不強制核對、標黃只是提醒）。
// 高風險：仍只有使用者按下確認鈕才送 import.confirm（表單 Enter、標黃、AI 完成都不會）；
// ai_parse 只由「用 AI 整理」觸發。PDF 來源的逐欄勾選不變。全部是假通道；內容為合成資料。
import type { ImportResult, ImportWebAiDraft } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const CAPTURED_AT = '2026-10-12T08:00:00.000Z';
type Kind = 'heading' | 'list_item' | 'label_value' | 'paragraph';
const b = (
  id: string,
  kind: Kind,
  text: string,
  extra: { level?: number; label?: string; continues?: boolean } = {},
) => ({
  id,
  kind,
  level: extra.level ?? null,
  label: extra.label ?? null,
  text,
  continues: extra.continues ?? false,
});

const WEB: ImportResult = {
  status: 'web_capture',
  displayName: '網頁：104',
  platform: '104',
  capturedAt: CAPTURED_AT,
  truncated: true,
  blocks: [
    b('b1', 'heading', '工作經驗', { level: 2 }),
    b('b2', 'paragraph', '範例科技股份有限公司 資深工程師'),
    b('b3', 'paragraph', '2019/03 ~ 至今'),
    b('b4', 'list_item', '負責後端服務', { level: 1 }),
    b('b5', 'list_item', '帶領三人團隊', { level: 2 }),
    b('b6', 'list_item', '並負責新人訓練', { level: 2, continues: true }),
    b('b7', 'heading', '學歷', { level: 2 }),
    b('b8', 'label_value', '範例大學 資訊工程系', { label: '最高學歷' }),
  ],
};

const PDF: ImportResult = {
  status: 'parsed',
  displayName: 'resume.pdf',
  pages: [{ pageNumber: 1, lines: ['範例科技'] }],
  pagesWithoutText: [],
  draft: {
    name: null,
    dates: [],
    companies: [],
    titles: [],
    experiences: [],
    skills: [],
    structured: { layout: '104', personalInfo: [], experiences: [], skills: [] },
  },
};

const f = (value: string, blockId: string, containsPersonalData = false) => ({
  value,
  blockId,
  containsPersonalData,
});

const DRAFT: ImportWebAiDraft = {
  personalInfo: [],
  education: [f('範例大學 資訊工程系', 'b8')],
  experiences: [
    {
      company: f('範例科技股份有限公司', 'b2'),
      title: f('資深工程師', 'b2'),
      startDate: f('2019/03', 'b3'),
      endDate: f('至今', 'b3'),
      current: true,
      description: f('負責後端服務\n帶領三人團隊', 'b4'),
    },
  ],
  skills: [f('林測試工具', 'b4', true)],
  otherSections: [],
  discarded: [],
};

function setup() {
  const replies: Record<string, (p: { importId?: string }) => unknown> = {
    'import.latest_capture': () => ({
      ok: true,
      capture: { importId: 'web-1', platform: '104', capturedAt: CAPTURED_AT, truncated: true },
    }),
    'import.get': (p) => ({ ok: true, result: p.importId === 'pdf-1' ? PDF : WEB }),
    'import.pick_pdf': () => ({
      ok: true,
      selection: { status: 'selected', importId: 'pdf-1', displayName: 'resume.pdf' },
    }),
    'import.ai_parse': () => ({
      ok: true,
      parse: { state: 'succeeded', failure: null, draft: null, source: 'web', webDraft: DRAFT },
    }),
    'import.confirm': () => ({ ok: true, profileId: 'p-1' }),
    'profile.get': () => ({ ok: true, profile: null }),
  };
  const send = vi.fn<BridgeTransport['send']>((raw) => {
    const request = raw as { op: string; payload: { importId?: string } };
    return Promise.resolve(replies[request.op]?.(request.payload));
  });
  const page = createElement(ImportPage, { aiPoll: { intervalMs: 1, maxPolls: 5 } });
  render(createElement(BridgeProvider, { transport: { send }, children: page }));
  const sent = (op: string) =>
    send.mock.calls.map(([r]) => r as { op: string; payload: unknown }).filter((r) => r.op === op);
  return { sent };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const field = (label: string) => screen.getByLabelText(label).closest('.import-field');
const flagNote = (label: string) =>
  within(field(label) as HTMLElement).queryByRole('note', { name: '標黃提醒' });

async function openAndParse() {
  fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));
  await screen.findByRole('button', { name: '查看擷取原文' });
  click('用 AI 整理');
  await screen.findByText(/預填來源：AI 整理/u);
}

afterEach(cleanup);

describe('<ImportPage /> 網頁來源核對（P1-T089／D29）', () => {
  it('原文預設收合（截斷提示仍在）；展開後照結構呈現，不顯示區塊編號與種類', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));
    const toggle = await screen.findByRole('button', { name: '查看擷取原文' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: '擷取原文內容' })).toBeNull();
    expect(screen.getByRole('note', { name: '內容不完整' })).toBeTruthy();
    fireEvent.click(toggle);
    const raw = screen.getByRole('group', { name: '擷取原文內容' });
    const text = raw.textContent ?? '';
    expect(text).toContain('範例科技股份有限公司 資深工程師');
    expect(text).not.toMatch(/b\d|區塊|清單項|標籤＋值|段落|表格列/u);
    expect(
      within(raw)
        .getAllByRole('heading')
        .map((h) => h.textContent?.trim()),
    ).toEqual(['工作經驗', '學歷']);
    // 清單項的續行（continues）併回前一項：不多出項目符號（codex 審查 2）
    const items = within(raw).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]?.textContent).toContain('帶領三人團隊');
    expect(items[1]?.textContent).toContain('並負責新人訓練');
    expect(within(raw).getByText('最高學歷').tagName).toBe('DT');
    expect(screen.getByRole('note', { name: '內容不完整' })).toBeTruthy();
  });

  it('欄位旁顯示出處原文；包含於單一區塊（只取一部分也算）不標黃，跨區塊與含個資標黃', async () => {
    setup();
    await openAndParse();
    expect(flagNote('第 1 段經歷公司')).toBeNull();
    expect(flagNote('第 1 段經歷職稱')).toBeNull();
    expect(flagNote('第 1 段經歷開始日期')).toBeNull();
    expect(flagNote('第 1 段經歷描述')?.textContent).toContain('多處');
    expect(screen.getByLabelText('技能 1').closest('li')?.textContent).toContain(
      '含姓名或聯絡資料',
    );
    expect(screen.getAllByRole('note', { name: '標黃提醒' })).toHaveLength(2);
    const company = within(field('第 1 段經歷公司') as HTMLElement);
    expect(company.getByRole('button', { name: /^出處原文：/u }).textContent).toBe(
      '出處：範例科技股份有限公司 資深工程師',
    );
    expect(screen.getByRole('note', { name: '確認提示' }).textContent).toContain('2 個標黃');
  });

  it('點出處：展開原文、捲到該區塊並只在那裡顯示區塊編號', async () => {
    setup();
    await openAndParse();
    expect(screen.queryByRole('group', { name: '擷取原文內容' })).toBeNull();
    const desc = within(field('第 1 段經歷描述') as HTMLElement);
    fireEvent.click(desc.getByRole('button', { name: /^出處原文：/u }));
    const raw = screen.getByRole('group', { name: '擷取原文內容' });
    const target = within(raw).getByText(/負責後端服務/u);
    expect(target.textContent).toContain('區塊 b4');
    expect(document.activeElement).toBe(target);
    expect(raw.textContent?.match(/區塊 b\d/gu)).toEqual(['區塊 b4']);
  });

  it('再點引用同一區塊的另一欄位出處：仍會捲到並聚焦（codex 審查 1）', async () => {
    setup();
    await openAndParse();
    const origin = (label: string) =>
      within(field(label) as HTMLElement).getByRole('button', { name: /^出處原文：/u });
    fireEvent.click(origin('第 1 段經歷公司'));
    const raw = screen.getByRole('group', { name: '擷取原文內容' });
    const target = within(raw).getByText(/範例科技股份有限公司 資深工程師/u);
    expect(document.activeElement).toBe(target);
    screen.getByLabelText('第 1 段經歷職稱').focus();
    fireEvent.click(origin('第 1 段經歷職稱'));
    expect(document.activeElement).toBe(target);
  });

  it('清單項的續行併回前一項，並保留自己的區塊錨點（codex 審查 2）', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: '使用這份' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看擷取原文' }));
    const raw = screen.getByRole('group', { name: '擷取原文內容' });
    const part = within(raw).getByText('並負責新人訓練');
    expect(part.closest('li')?.textContent).toContain('帶領三人團隊');
    expect(part.id).toMatch(/-b6$/u);
  });

  it('改過標黃欄位就不再標黃', async () => {
    setup();
    await openAndParse();
    fireEvent.change(screen.getByLabelText('第 1 段經歷描述'), {
      target: { value: '負責後端服務' },
    });
    expect(flagNote('第 1 段經歷描述')).toBeNull();
    expect(screen.getAllByRole('note', { name: '標黃提醒' })).toHaveLength(1);
  });

  it('有標黃也能確認、沒有勾選；精簡摘要預設收合；只有按確認鈕才送 import.confirm', async () => {
    const { sent } = setup();
    await openAndParse();
    expect(screen.queryByRole('checkbox', { name: /逐欄核對/u })).toBeNull();
    const confirm = screen.getByRole('button', { name: '確認並寫入個人資料' });
    expect(confirm).toHaveProperty('disabled', false);
    expect(screen.getByRole('note', { name: '確認提示' }).textContent).toContain(
      '沒看也能確認；產生履歷前建議到個人資料頁檢查一次',
    );
    const summary = screen.getByRole('list', { name: '內容摘要' }).closest('details');
    expect(summary?.open).toBe(false);
    expect(summary?.textContent).toContain('範例科技股份有限公司｜資深工程師｜2019/03 ~ 至今');
    expect(summary?.textContent).toContain('學歷：範例大學 資訊工程系');
    // AI 完成、表單 Enter（隱式送出）都不寫入
    fireEvent.submit(screen.getByRole('group', { name: '校正內容' }).closest('form') as Element);
    await settle();
    expect(sent('import.confirm')).toEqual([]);
    fireEvent.click(confirm);
    await screen.findByText(/已確認並寫入個人資料/u);
    expect(sent('import.confirm')).toHaveLength(1);
    expect(sent('import.confirm')[0]?.payload).toMatchObject({
      importId: 'web-1',
      profile: {
        personalInfo: { 學歷: '範例大學 資訊工程系' },
        experiences: [{ company: '範例科技股份有限公司', title: '資深工程師', endDate: null }],
        skills: ['林測試工具'],
      },
    });
    expect(sent('import.ai_parse')).toHaveLength(1);
  });

  it('PDF 來源不變：仍要勾選「我已逐欄核對」，沒有出處、標黃與摘要', async () => {
    const { sent } = setup();
    await screen.findByRole('button', { name: '使用這份' });
    click('選擇履歷 PDF');
    const confirm = await screen.findByRole('button', { name: '確認並寫入個人資料' });
    expect(confirm).toHaveProperty('disabled', true);
    expect(screen.queryByRole('list', { name: '內容摘要' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^出處原文：/u })).toBeNull();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '林測試' } });
    fireEvent.submit(confirm.closest('form') as Element);
    await settle();
    expect(sent('import.confirm')).toEqual([]);
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    expect(confirm).toHaveProperty('disabled', false);
  });
});
