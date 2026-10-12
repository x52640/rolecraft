// @vitest-environment jsdom
import type { ImportResult } from '@rolecraft/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeProvider } from '../../bridge/BridgeProvider.tsx';
import { HELPER_BUSY_MESSAGE } from '../../bridge/helper-busy.ts';
import type { BridgeTransport } from '../../bridge/transport.ts';
import { ImportPage } from './ImportPage.tsx';

const PARSED: ImportResult = {
  status: 'parsed',
  displayName: 'resume.pdf',
  pages: [
    {
      pageNumber: 1,
      lines: ['姓名：王小明', '2019/03 ~ 至今 | 宏碁股份有限公司 | 資深工程師', '負責付款系統'],
    },
  ],
  pagesWithoutText: [],
  draft: {
    name: { value: '王小明', pageNumber: 1, lineIndex: 0 },
    dates: [{ value: '2019/03 ~ 至今', pageNumber: 1, lineIndex: 1 }],
    companies: [{ value: '宏碁股份有限公司', pageNumber: 1, lineIndex: 1 }],
    titles: [{ value: '資深工程師', pageNumber: 1, lineIndex: 1 }],
    experiences: [
      { value: '2019/03 ~ 至今 | 宏碁股份有限公司 | 資深工程師', pageNumber: 1, lineIndex: 1 },
      { value: '負責付款系統', pageNumber: 1, lineIndex: 2 },
    ],
    skills: [],
  },
};

type Handler = (request: { op: string; payload: unknown }) => unknown;

/** 依操作回覆的假通道；記錄每一則請求。 */
function setup(result: ImportResult | null, overrides: Record<string, unknown> = {}) {
  const replies: Record<string, unknown> = {
    'import.pick_pdf': result
      ? { ok: true, selection: { status: 'selected', importId: 'imp-1', displayName: 'x.pdf' } }
      : { ok: true, selection: { status: 'cancelled' } },
    'import.get': { ok: true, result },
    'import.confirm': { ok: true, profileId: 'p-1' },
    ...overrides,
  };
  const handler: Handler = (request) => replies[request.op];
  const send = vi.fn<BridgeTransport['send']>((request) =>
    Promise.resolve(handler(request as { op: string; payload: unknown })),
  );
  render(
    createElement(BridgeProvider, { transport: { send }, children: createElement(ImportPage) }),
  );
  const sent = (op: string) =>
    send.mock.calls.map(([r]) => r as { op: string; payload: unknown }).filter((r) => r.op === op);
  return { send, sent };
}

async function pickFile() {
  fireEvent.click(screen.getByRole('button', { name: '選擇履歷 PDF' }));
  await screen.findByRole('button', { name: '確認並寫入個人資料' });
  // 非 104 版面會自動 AI 整理（P1-T069，這裡的假通道回失敗）：等整理結束、表單解鎖再操作
  await waitFor(() => expect(screen.queryByText(/AI 整理中/u)).toBeNull());
}

afterEach(cleanup);

describe('<ImportPage />（P1-T020）', () => {
  it('選檔請求不帶任何路徑；解析成功顯示原文與預填欄位', async () => {
    const { sent } = setup(PARSED);
    await pickFile();
    expect(sent('import.pick_pdf')).toEqual([{ op: 'import.pick_pdf', payload: {} }]);
    expect(sent('import.get')).toEqual([{ op: 'import.get', payload: { importId: 'imp-1' } }]);
    const original = screen.getByRole('list', { name: '第 1 頁原文' });
    expect(within(original).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByLabelText<HTMLInputElement>('姓名').value).toBe('王小明');
    expect(screen.getByLabelText<HTMLInputElement>('第 1 段經歷公司').value).toBe(
      '宏碁股份有限公司',
    );
    expect(screen.getByLabelText<HTMLInputElement>('第 1 段經歷至今').checked).toBe(true);
  });

  it('沒勾「已逐欄核對」不能確認；確認時送出校正後的內容', async () => {
    const { sent } = setup(PARSED);
    await pickFile();
    const confirm = screen.getByRole('button', { name: '確認並寫入個人資料' });
    expect(confirm).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('第 1 段經歷職稱'), { target: { value: '技術主管' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    fireEvent.click(confirm);
    await screen.findByText(/已確認並寫入個人資料/u);
    expect(sent('import.confirm')).toEqual([
      {
        op: 'import.confirm',
        payload: {
          importId: 'imp-1',
          profile: {
            personalInfo: { 姓名: '王小明' },
            experiences: [
              {
                company: '宏碁股份有限公司',
                title: '技術主管',
                startDate: '2019/03',
                endDate: null,
                description: '負責付款系統',
              },
            ],
            skills: [],
          },
        },
      },
    ]);
  });

  it('改了內容就要重新勾選核對', async () => {
    setup(PARSED);
    await pickFile();
    const box = screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' });
    fireEvent.click(box);
    expect(box).toHaveProperty('checked', true);
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王大明' } });
    expect(box).toHaveProperty('checked', false);
  });

  it('沒有「暫存校正」：核對畫面只有存入，並提醒存入前離開會丟掉修改（P1-T051）', async () => {
    const { sent } = setup(PARSED);
    await pickFile();
    expect(screen.queryByRole('button', { name: /暫存/u })).toBeNull();
    expect(screen.queryByText(/暫存/u)).toBeNull();
    expect(screen.getByRole('note', { name: '尚未存入提醒' }).textContent).toContain(
      '存入前離開頁面，修改不會保留',
    );
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王大明' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並寫入個人資料' }));
    await screen.findByText(/已確認並寫入個人資料/u);
    expect(sent('import.save_corrections')).toEqual([]);
    expect(sent('import.confirm')).toHaveLength(1);
  });

  it('解析失敗：清楚提示原因，改為手動輸入並可確認（D18）', async () => {
    const failed: ImportResult = {
      status: 'failed',
      displayName: 'scan.pdf',
      reason: 'no_text_layer',
    };
    const { sent } = setup(failed);
    await pickFile();
    const alert = screen.getByRole('alert', { name: '解析失敗' });
    expect(alert.textContent).toContain('沒有文字層');
    expect(alert.textContent).toContain('手動輸入');
    expect(screen.queryByRole('region', { name: '解析預覽' })).toBeNull();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王小明' } });
    fireEvent.click(screen.getByRole('button', { name: '新增技能' }));
    fireEvent.change(screen.getByLabelText('技能 1'), { target: { value: 'SQL' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並寫入個人資料' }));
    await screen.findByText(/已確認並寫入個人資料/u);
    expect(sent('import.confirm')[0]?.payload).toEqual({
      importId: 'imp-1',
      profile: { personalInfo: { 姓名: '王小明' }, experiences: [], skills: ['SQL'] },
    });
  });

  it('欄位有缺漏：列出問題、不送出', async () => {
    const { sent } = setup(PARSED);
    await pickFile();
    fireEvent.change(screen.getByLabelText('第 1 段經歷公司'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並寫入個人資料' }));
    const problems = await screen.findByRole('alert', { name: '需要修正' });
    expect(problems.textContent).toContain('第 1 段經歷：公司不可空白');
    expect(sent('import.confirm')).toEqual([]);
    // 確認列在視窗底部：清單要被聚焦（捲進畫面），確認列也提示項數。
    await waitFor(() => expect(document.activeElement).toBe(problems));
    expect(problems.getAttribute('tabindex')).toBe('-1');
    const bar = screen.getByRole('group', { name: '確認列' });
    expect(bar.textContent).toContain(`有 ${String(problems.children.length)} 項需要修正`);
    expect(within(bar).getByRole('note', { name: '尚未存入提醒' })).toBeTruthy();
  });

  it('再次送出仍失敗：焦點回到錯誤清單', async () => {
    setup(PARSED);
    await pickFile();
    fireEvent.change(screen.getByLabelText('第 1 段經歷公司'), { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    const confirm = screen.getByRole('button', { name: '確認並寫入個人資料' });
    fireEvent.click(confirm);
    const problems = await screen.findByRole('alert', { name: '需要修正' });
    await waitFor(() => expect(document.activeElement).toBe(problems));
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(document.activeElement).toBe(problems));
  });

  it('取消選檔：回到初始畫面，不讀解析結果', async () => {
    const { sent } = setup(null);
    fireEvent.click(screen.getByRole('button', { name: '選擇履歷 PDF' }));
    await waitFor(() => expect(sent('import.pick_pdf')).toHaveLength(1));
    await screen.findByRole('button', { name: '選擇履歷 PDF' });
    expect(sent('import.get')).toEqual([]);
  });

  it('helper 連不到或確認失敗：顯示錯誤、保留表單', async () => {
    const unavailable = { ok: false, error: { code: 'helper_unavailable', message: 'x' } };
    setup(null, { 'import.pick_pdf': unavailable });
    fireEvent.click(screen.getByRole('button', { name: '選擇履歷 PDF' }));
    expect((await screen.findByRole('alert')).textContent).toContain('連不到本機輔助程式');
    cleanup();

    const rejected = { ok: false, error: { code: 'invalid_request', message: '找不到這筆匯入' } };
    setup(PARSED, { 'import.confirm': rejected });
    await pickFile();
    fireEvent.click(screen.getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' }));
    fireEvent.click(screen.getByRole('button', { name: '確認並寫入個人資料' }));
    expect((await screen.findByText('找不到這筆匯入')).getAttribute('role')).toBe('alert');
    expect(screen.getByLabelText<HTMLInputElement>('姓名').value).toBe('王小明');
  });

  it('helper 被另一個瀏覽器占用：照原文顯示占用訊息', async () => {
    const busy = { ok: false, error: { code: 'helper_unavailable', message: HELPER_BUSY_MESSAGE } };
    setup(null, { 'import.pick_pdf': busy });
    fireEvent.click(screen.getByRole('button', { name: '選擇履歷 PDF' }));
    expect((await screen.findByRole('alert')).textContent).toBe(HELPER_BUSY_MESSAGE);
  });

  it('在核對畫面改選檔案後取消或失敗：回到原本的核對畫面，保留已改內容', async () => {
    const { send, sent } = setup(PARSED);
    await pickFile();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王大明' } });
    const replies: unknown[] = [
      { ok: true, selection: { status: 'cancelled' } },
      { ok: false, error: { code: 'helper_unavailable', message: 'x' } },
    ];
    send.mockImplementation(() => Promise.resolve(replies.shift()));

    fireEvent.click(screen.getByRole('button', { name: '改選其他檔案' }));
    await waitFor(() => expect(sent('import.pick_pdf')).toHaveLength(2));
    await screen.findByRole('button', { name: '確認並寫入個人資料' });
    expect(screen.getByLabelText<HTMLInputElement>('姓名').value).toBe('王大明');

    fireEvent.click(screen.getByRole('button', { name: '改選其他檔案' }));
    expect((await screen.findByRole('alert')).textContent).toContain('連不到本機輔助程式');
    await screen.findByRole('button', { name: '確認並寫入個人資料' });
    expect(screen.getByLabelText<HTMLInputElement>('姓名').value).toBe('王大明');
  });

  it('版面（P1-T067）：每個輸入框都有 <label>；確認列只在表單存在時出現', async () => {
    setup(PARSED);
    expect(screen.queryByRole('group', { name: '確認列' })).toBeNull();
    await pickFile();
    fireEvent.click(screen.getByRole('button', { name: '新增技能' }));
    fireEvent.click(screen.getByRole('button', { name: '新增一段經歷' }));
    const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    );
    expect(fields.length).toBeGreaterThan(5);
    for (const field of fields) expect(field.labels?.length ?? 0, field.outerHTML).toBe(1);
    const bar = screen.getByRole('group', { name: '確認列' });
    within(bar).getByRole('checkbox', { name: '我已逐欄核對，以上內容正確' });
    within(bar).getByRole('button', { name: '確認並寫入個人資料' });
  });

  it('經歷卡片標題帶公司／職稱，空白顯示「未填」；技能可刪單一個', async () => {
    setup(PARSED);
    await pickFile();
    screen.getByRole('group', { name: '第 1 段：宏碁股份有限公司｜資深工程師' });
    fireEvent.click(screen.getByRole('button', { name: '新增一段經歷' }));
    screen.getByRole('group', { name: '第 2 段：未填｜未填' });
    expect(screen.getByLabelText('第 1 段經歷描述').getAttribute('rows')).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: '新增技能' }));
    fireEvent.click(screen.getByRole('button', { name: '新增技能' }));
    fireEvent.change(screen.getByLabelText('技能 1'), { target: { value: 'SQL' } });
    fireEvent.change(screen.getByLabelText('技能 2'), { target: { value: 'Go' } });
    fireEvent.click(screen.getByRole('button', { name: '刪除技能 1' }));
    expect(screen.getByLabelText<HTMLInputElement>('技能 1').value).toBe('Go');
    expect(screen.queryByLabelText('技能 2')).toBeNull();
  });
});
