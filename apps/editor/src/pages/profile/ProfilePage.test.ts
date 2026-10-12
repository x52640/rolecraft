// @vitest-environment jsdom
// P1-T091 個人資料頁（D30）：讀取、出處顯示、逐欄修改／刪除／新增、按儲存才送、版本號與來源列。
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { button, input, renderPage, updates } from './page.test-helpers.ts';
import { PROFILE_PAGE_TEXT } from './profile-text.ts';
import { fakeProfileBridge, sampleProfile } from './profile.test-helpers.ts';

afterEach(cleanup);

describe('讀取與出處', () => {
  it('顯示各欄與出處原文；已修改、截斷、沒有出處都標示；長出處可展開', async () => {
    renderPage(fakeProfileBridge());
    expect((await screen.findByLabelText<HTMLInputElement>('經歷 1 公司')).value).toBe('甲公司');
    expect(input('基本資料 3 欄位名稱').value).toBe('學歷');
    expect(input('技能 2').value).toBe('React');
    const sources = screen.getAllByTestId('field-source').map((el) => el.textContent);
    expect(sources).toContain('出處（網頁）：姓名：王小明');
    expect(sources).toContain('出處（PDF）：乙公司 實習生');
    // helper 標過「已修改」的欄位（經歷 2 職稱）照標
    expect(screen.getAllByText('已修改')).toHaveLength(1);
    expect(screen.getByText('（原文超過 300 字，已截斷）')).toBeTruthy();
    expect(screen.getAllByText('沒有出處原文').length).toBeGreaterThan(0);
    // 每個出處都可展開（短的在窄視窗也可能被截成兩行）
    const expands = screen.getAllByRole('button', { name: '展開出處' });
    expect(expands).toHaveLength(screen.getAllByTestId('field-source').length);
    const [expand] = expands;
    if (!expand) throw new Error('應有展開按鈕');
    fireEvent.click(expand);
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByTestId('unsaved')).toBeNull();
  });

  it('沒有 Profile：導向匯入頁，不顯示表單', async () => {
    renderPage(fakeProfileBridge(null));
    const link = await screen.findByRole('link', { name: '到匯入頁' });
    expect(link.getAttribute('href')).toBe('#/import');
    expect(screen.queryByRole('button', { name: '儲存' })).toBeNull();
  });

  it('多份 Profile：顯示固定原因，不讀不寫', async () => {
    const fake = fakeProfileBridge('multiple');
    renderPage(fake);
    const note = await screen.findByRole('note', { name: '無法編輯的原因' });
    expect(note.textContent).toBe(PROFILE_PAGE_TEXT.multiple);
    expect(screen.queryByRole('button', { name: '儲存' })).toBeNull();
    expect(updates(fake)).toHaveLength(0);
  });
});

describe('修改、刪除、新增後儲存', () => {
  it('不按儲存不送；儲存帶版本號與來源列、不帶出處文字；成功後顯示固定提示並以回傳內容更新', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('經歷 1 描述');
    fireEvent.change(input('基本資料 2 內容'), { target: { value: 'new@example.test' } });
    fireEvent.click(button('新增技能'));
    fireEvent.change(input('技能 3'), { target: { value: 'Vitest' } });
    fireEvent.click(button('新增基本資料'));
    fireEvent.change(input('基本資料 4 欄位名稱'), { target: { value: '城市' } });
    fireEvent.change(input('基本資料 4 內容'), { target: { value: '台北' } });
    fireEvent.click(button('刪除技能 1'));

    expect(screen.getByTestId('unsaved').textContent).toBe('尚未儲存');
    expect(screen.getAllByText('自行新增')).toHaveLength(2);
    expect(screen.getAllByText('已修改')).toHaveLength(2);
    expect(updates(fake)).toHaveLength(0);
    expect(screen.queryByRole('note', { name: '對不到經歷的提示' })).toBeNull();

    fireEvent.click(button('儲存'));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      PROFILE_PAGE_TEXT.saved,
    );
    const [sent] = updates(fake);
    expect(sent).toEqual({
      baseVersion: 3,
      personalInfo: [
        { label: '姓名', value: '王小明', from: '姓名' },
        { label: 'Email', value: 'new@example.test', from: 'Email' },
        { label: '學歷', value: '某大學 資訊工程學系', from: '學歷' },
        { label: '城市', value: '台北', from: null },
      ],
      experiences: [
        { ...sampleProfile().experiences[0], from: 0 },
        { ...sampleProfile().experiences[1], from: 1 },
      ],
      skills: [
        { value: 'React', from: 1 },
        { value: 'Vitest', from: null },
      ],
    });
    // 請求不帶任何出處文字
    expect(JSON.stringify(sent)).not.toMatch(/出處|技能：|姓名：|sources|truncated|modified/);
    await waitFor(() => expect(screen.queryByTestId('unsaved')).toBeNull());
    expect(input('技能 1').value).toBe('React');
    expect(fake.profile?.version).toBe(4);
    // 存檔後再存一次帶的是回傳的新版本號
    fireEvent.change(input('技能 2'), { target: { value: 'Playwright' } });
    fireEvent.click(button('儲存'));
    await waitFor(() => expect(updates(fake)).toHaveLength(2));
    expect(updates(fake)[1]?.baseVersion).toBe(4);
  });

  it('改經歷公司、刪整段經歷：儲存前提示對不到與不刪 PDF，再按一次才送', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('經歷 1 公司');
    fireEvent.change(input('經歷 1 公司'), { target: { value: '甲股份有限公司' } });
    fireEvent.click(button('刪除經歷 2'));
    const warning = screen.getByRole('note', { name: '對不到經歷的提示' });
    expect(warning.textContent).toContain(PROFILE_PAGE_TEXT.unmatched);
    expect(warning.textContent).toContain('改了公司、職稱或開始：甲公司｜前端工程師');
    expect(warning.textContent).toContain('刪除整段：乙公司｜實習生');
    expect(warning.textContent).toContain(PROFILE_PAGE_TEXT.removeKeepsPdf);
    const rest = (document.body.textContent ?? '').replaceAll(PROFILE_PAGE_TEXT.removeKeepsPdf, '');
    expect(rest).not.toMatch(/會(一併)?刪除[^。]*(匯出|PDF)/);

    fireEvent.click(button('儲存'));
    expect(warning.textContent).toContain('確定的話再按一次「儲存」');
    expect(updates(fake)).toHaveLength(0);
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(updates(fake)[0]?.experiences).toEqual([
      { ...sampleProfile().experiences[0], company: '甲股份有限公司', from: 0 },
    ]);
  });

  it('確認後又改了內容：要重新確認', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('經歷 1 職稱');
    fireEvent.change(input('經歷 1 職稱'), { target: { value: '資深前端工程師' } });
    fireEvent.click(button('儲存'));
    fireEvent.change(input('經歷 1 描述'), { target: { value: '改描述' } });
    fireEvent.click(button('儲存'));
    expect(updates(fake)).toHaveLength(0);
  });

  it('驗證不過（公司空白、技能空白）：顯示原因，不送', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: '  ' } });
    fireEvent.click(button('儲存'));
    expect((await screen.findByRole('alert')).textContent).toContain('技能不能空白');
    fireEvent.change(input('技能 1'), { target: { value: 'TS' } });
    fireEvent.click(button('新增一段經歷'));
    expect(screen.getAllByText('自行新增').length).toBeGreaterThan(0);
    fireEvent.click(button('儲存'));
    expect((await screen.findByRole('alert')).textContent).toContain('經歷 3 的公司、職稱、開始');
    expect(updates(fake)).toHaveLength(0);
  });

  it('改成至今：結束送 null', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('經歷 2 至今');
    fireEvent.click(input('經歷 2 至今'));
    expect(input('經歷 2 結束').disabled).toBe(true);
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(updates(fake)[0]?.experiences[1]?.endDate).toBeNull();
  });
});
