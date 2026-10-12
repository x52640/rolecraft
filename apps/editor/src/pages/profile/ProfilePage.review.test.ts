// @vitest-environment jsdom
// P1-T091 審查項：多行基本資料、繼承屬性標籤、短出處可展開、沒動的欄位不修剪、切頁攔未存修改。
import type { ProfileExperienceSources } from '@rolecraft/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../app/App.tsx';
import { button, input, renderPage, updates } from './page.test-helpers.ts';
import { PROFILE_PAGE_TEXT } from './profile-text.ts';
import { fakeProfileBridge, sampleProfile, src } from './profile.test-helpers.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', window.location.pathname);
});

const noExp: ProfileExperienceSources = {
  company: null,
  title: null,
  startDate: null,
  endDate: null,
  description: null,
};
const sourcesWith = (personalInfo: Record<string, ReturnType<typeof src>>) => ({
  personalInfo,
  experiences: [noExp, noExp],
  skills: [null, null],
});

describe('審查項', () => {
  it('學歷等多行值：換行保留，改別欄存檔時原樣送回', async () => {
    const multi = '某大學 資訊工程學系\n某研究所 碩士';
    const fake = fakeProfileBridge(
      sampleProfile({ personalInfo: { 姓名: '王小明', 學歷: multi }, sources: undefined }),
    );
    renderPage(fake);
    const edu = await screen.findByLabelText<HTMLTextAreaElement>('基本資料 2 內容');
    expect(edu.value).toBe(multi);
    fireEvent.change(input('技能 1'), { target: { value: 'Go' } });
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(updates(fake)[0]?.personalInfo[1]).toEqual({
      label: '學歷',
      value: multi,
      from: '學歷',
    });
  });

  it('標籤是 constructor、toString：頁面正常顯示、沒有出處', async () => {
    renderPage(
      fakeProfileBridge(
        sampleProfile({
          personalInfo: { constructor: 'x', toString: 'y' },
          sources: sourcesWith({}),
        }),
      ),
    );
    const first = await screen.findByLabelText<HTMLInputElement>('基本資料 1 欄位名稱');
    expect(first.value).toBe('constructor');
    expect(input('基本資料 2 欄位名稱').value).toBe('toString');
  });

  it('很短的出處也可以展開', async () => {
    renderPage(
      fakeProfileBridge(
        sampleProfile({
          personalInfo: { 姓名: '王小明' },
          sources: sourcesWith({ 姓名: src('王小明') }),
        }),
      ),
    );
    expect(await screen.findByRole('button', { name: '展開出處' })).toBeTruthy();
  });

  it('沒動的欄位帶頭尾空白：原樣送回，存檔後不被標「已修改」', async () => {
    const fake = fakeProfileBridge(
      sampleProfile({
        personalInfo: { 姓名: ' 王小明 ' },
        sources: sourcesWith({ 姓名: src('姓名：王小明') }),
      }),
    );
    renderPage(fake);
    await screen.findByLabelText('技能 1');
    fireEvent.change(input('技能 1'), { target: { value: 'Go' } });
    fireEvent.click(button('儲存'));
    await screen.findByRole('status');
    expect(updates(fake)[0]?.personalInfo[0]?.value).toBe(' 王小明 ');
    expect(fake.profile?.sources?.personalInfo['姓名']?.modified).toBe(false);
  });
});

describe('切頁攔未存修改', () => {
  const goTo = (hash: string) => {
    act(() => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  };
  const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

  function openApp() {
    const fake = fakeProfileBridge();
    window.history.replaceState(null, '', '#/profile');
    render(createElement(App, { transport: { send: (r) => fake.transport.send(r) } }));
    return fake;
  }

  it('有未存修改：不確認留在原頁且修改保留；確認才離開', async () => {
    const fake = openApp();
    await screen.findByLabelText('技能 1');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.change(input('技能 1'), { target: { value: 'Go' } });
    goTo('#/import');
    expect(confirm).toHaveBeenCalledWith(PROFILE_PAGE_TEXT.leave);
    expect(heading()).toBe('個人資料');
    expect(input('技能 1').value).toBe('Go');
    expect(window.location.hash).toBe('#/profile');

    confirm.mockReturnValue(true);
    goTo('#/import');
    await waitFor(() => expect(heading()).toBe('匯入'));
    expect(updates(fake)).toHaveLength(0);
  });

  it('沒有未存修改：直接換頁、不問', async () => {
    openApp();
    await screen.findByLabelText('技能 1');
    const confirm = vi.spyOn(window, 'confirm');
    goTo('#/import');
    expect(confirm).not.toHaveBeenCalled();
    expect(heading()).toBe('匯入');
  });
});
