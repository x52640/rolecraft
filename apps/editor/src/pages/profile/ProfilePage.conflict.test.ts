// @vitest-environment jsdom
// P1-T091 個人資料頁（D30 (c)）：衝突時重新讀取、捨棄未存修改、不自動重送；請求鎖、其他失敗、重新讀取確認、離開確認。
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { button, input, renderPage, updates } from './page.test-helpers.ts';
import { PROFILE_PAGE_TEXT } from './profile-text.ts';
import { fakeProfileBridge, sampleProfile } from './profile.test-helpers.ts';

afterEach(cleanup);

const gets = (fake: ReturnType<typeof fakeProfileBridge>) =>
  fake.requests.filter((r) => r.op === 'profile.get').length;

describe('版本衝突（D30 (c)）', () => {
  it('別處已更新：顯示固定訊息、重新讀取最新內容、未存修改捨棄，不自動重送', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: '我的修改' } });
    // 頁面開著時另一處確認了一次匯入
    fake.profile = sampleProfile({ skills: ['Go', 'Rust'], version: 4, sources: undefined });
    const before = gets(fake);
    fireEvent.click(button('儲存'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      '個人資料已在別處更新，這次修改沒有存',
    );
    await waitFor(() => expect(input('技能 1').value).toBe('Go'));
    expect(gets(fake)).toBe(before + 1);
    expect(updates(fake)).toHaveLength(1);
    expect(updates(fake)[0]?.baseVersion).toBe(3);
    expect(screen.queryByTestId('unsaved')).toBeNull();
    expect(document.body.textContent).not.toContain('我的修改');
    // 之後使用者自己再存，帶的是重新讀到的版本號
    fireEvent.change(input('技能 2'), { target: { value: 'Zig' } });
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(updates(fake)[1]?.baseVersion).toBe(4);
  });

  it('其他失敗：顯示原因，畫面上的修改保留，可再按儲存', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: 'Svelte' } });
    fake.failNextUpdate = {
      ok: false,
      error: { code: 'internal_error', message: '寫入失敗' },
    };
    fireEvent.click(button('儲存'));
    expect((await screen.findByRole('alert')).textContent).toBe('寫入失敗');
    expect(input('技能 1').value).toBe('Svelte');
    expect(screen.getByTestId('unsaved')).toBeTruthy();
    expect(fake.profile?.skills[0]).toBe('TypeScript');
  });
  it('儲存時資料區已沒有 Profile：顯示沒有存、改成導向匯入頁', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: 'Svelte' } });
    fake.profile = null;
    fireEvent.click(button('儲存'));
    expect((await screen.findByRole('alert')).textContent).toBe(PROFILE_PAGE_TEXT.missingOnSave);
    expect(await screen.findByRole('link', { name: '到匯入頁' })).toBeTruthy();
    expect(updates(fake)).toHaveLength(1);
  });
});

describe('請求鎖', () => {
  it('儲存進行中：表單與按鈕鎖住、輸入不套用、不會送第二次', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: 'Vue' } });
    fake.holdUpdate();
    fireEvent.click(button('儲存'));
    await waitFor(() => expect(input('技能 1').matches(':disabled')).toBe(true));
    expect(button('儲存中…')).toHaveProperty('disabled', true);
    expect(button('重新讀取')).toHaveProperty('disabled', true);
    fireEvent.click(button('儲存中…'));
    fireEvent.change(input('技能 1'), { target: { value: '被鎖住時的輸入' } });
    await act(async () => {
      fake.hold?.release();
      await Promise.resolve();
    });
    await screen.findByRole('status');
    expect(updates(fake)).toHaveLength(1);
    expect(input('技能 1').value).toBe('Vue');
  });
});

describe('未存修改', () => {
  it('重新讀取：有未存修改時再按一次才捨棄', async () => {
    const fake = fakeProfileBridge();
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: 'Elm' } });
    const before = gets(fake);
    fireEvent.click(button('重新讀取'));
    expect(screen.getByText(PROFILE_PAGE_TEXT.reloadWarning)).toBeTruthy();
    expect(gets(fake)).toBe(before);
    fireEvent.click(button('重新讀取'));
    await screen.findByText(PROFILE_PAGE_TEXT.reloaded);
    expect(input('技能 1').value).toBe('TypeScript');
  });

  it('有未存修改時關閉分頁要確認；存好後不再攔', async () => {
    renderPage(fakeProfileBridge());
    await screen.findByLabelText('技能 1');
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    fireEvent.change(input('技能 1'), { target: { value: 'Elm' } });
    expect(leave()).toBe(true);
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(leave()).toBe(false);
  });
});
