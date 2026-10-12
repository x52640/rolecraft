import { describe, expect, it, vi } from 'vitest';

import { runSiteCapture } from '../sites/runtime.ts';
import { adapter104 } from '../sites/104/adapter.ts';
import type { SiteEntry } from '../sites/registry.ts';
import {
  handleActionClick,
  INJECT_FAILED_NOTICE,
  openEditor,
  triggerCapture,
  UNSUPPORTED_PAGE_NOTICE,
  type ActionApis,
} from './actions.ts';

/** 合成的履歷頁規則（實際各站規則在 P1-T077）。 */
const REGISTRY: readonly SiteEntry[] = [
  {
    platform: '104',
    hosts: ['www.104.com.tw'],
    jobPathPrefixes: ['/job/'],
    resumePage: {
      hosts: ['pda.104.com.tw'],
      paths: ['/profile/edit'],
      rootSelector: '#root',
      nameSelector: null,
    },
  },
];

const EDITOR_URL = 'chrome-extension://id/editor/index.html';
const RESUME_TAB = { id: 7, url: 'https://pda.104.com.tw/profile/edit?vno=1' };
const JOB_TAB = { id: 7, url: 'https://www.104.com.tw/job/x' };

function fakeApis(injectFails = false) {
  return {
    getURL: vi.fn((p: string) => `chrome-extension://id/${p}`),
    createTab: vi.fn(() => Promise.resolve()),
    injectScript: vi.fn(() =>
      injectFails ? Promise.reject(new Error('Cannot access contents')) : Promise.resolve(),
    ),
    showTabNotice: vi.fn(() => Promise.resolve()),
  } satisfies ActionApis;
}

describe('點工具列圖示', () => {
  it('openEditor 開編輯器擴充功能頁', async () => {
    const apis = fakeApis();
    await openEditor(apis);
    expect(apis.createTab).toHaveBeenCalledWith(EDITOR_URL);
  });

  it('履歷頁：只注入履歷頁腳本，不開編輯器', async () => {
    const apis = fakeApis();
    expect(await handleActionClick(RESUME_TAB, apis, REGISTRY)).toBe('injected');
    expect(apis.injectScript).toHaveBeenCalledExactlyOnceWith(7, 'sites/104-resume.js');
    expect(apis.createTab).not.toHaveBeenCalled();
  });

  it.each<[string, { id?: number; url?: string } | undefined]>([
    ['職缺頁', JOB_TAB],
    ['不支援的網站', { id: 7, url: 'https://www.linkedin.com/in/me' }],
    ['擴充功能頁', { id: 7, url: EDITOR_URL }],
    ['拿不到網址', { id: 7 }],
    ['拿不到分頁 id', { url: RESUME_TAB.url }],
    ['沒有分頁', undefined],
  ])('%s：開編輯器、不注入', async (_name, tab) => {
    const apis = fakeApis();
    expect(await handleActionClick(tab, apis, REGISTRY)).toBe('opened_editor');
    expect(apis.createTab).toHaveBeenCalledExactlyOnceWith(EDITOR_URL);
    expect(apis.injectScript).not.toHaveBeenCalled();
  });

  it('正式 registry 還沒有履歷頁規則：104 履歷頁照舊開編輯器', async () => {
    const apis = fakeApis();
    expect(await handleActionClick(RESUME_TAB, apis)).toBe('opened_editor');
    expect(apis.injectScript).not.toHaveBeenCalled();
  });

  it('注入失敗：不開編輯器，在圖示上提示', async () => {
    const apis = fakeApis(true);
    expect(await handleActionClick(RESUME_TAB, apis, REGISTRY)).toBe('inject_failed');
    expect(apis.createTab).not.toHaveBeenCalled();
    expect(apis.showTabNotice).toHaveBeenCalledExactlyOnceWith(7, INJECT_FAILED_NOTICE);
  });
});

describe('擷取快捷鍵', () => {
  it('職缺頁：注入職缺頁腳本', async () => {
    const apis = fakeApis();
    expect(await triggerCapture(JOB_TAB, apis, REGISTRY)).toBe('injected');
    expect(apis.injectScript).toHaveBeenCalledExactlyOnceWith(7, 'sites/104.js');
  });

  it('履歷頁：注入履歷頁腳本', async () => {
    const apis = fakeApis();
    expect(await triggerCapture(RESUME_TAB, apis, REGISTRY)).toBe('injected');
    expect(apis.injectScript).toHaveBeenCalledExactlyOnceWith(7, 'sites/104-resume.js');
  });

  it('正式 registry 的 104 職缺頁照舊注入', async () => {
    const apis = fakeApis();
    expect(await triggerCapture(JOB_TAB, apis)).toBe('injected');
    expect(apis.injectScript).toHaveBeenCalledWith(7, 'sites/104.js');
  });

  it('都不符：不注入、不開編輯器，只在圖示提示', async () => {
    const apis = fakeApis();
    const tab = { id: 7, url: 'https://www.linkedin.com/jobs/1' };
    expect(await triggerCapture(tab, apis, REGISTRY)).toBe('unsupported_page');
    expect(apis.injectScript).not.toHaveBeenCalled();
    expect(apis.createTab).not.toHaveBeenCalled();
    expect(apis.showTabNotice).toHaveBeenCalledExactlyOnceWith(7, UNSUPPORTED_PAGE_NOTICE);
    expect(UNSUPPORTED_PAGE_NOTICE).toContain('不是支援的職缺頁或履歷頁');
  });

  it('沒有分頁：什麼都不做', async () => {
    const apis = fakeApis();
    expect(await triggerCapture(undefined, apis, REGISTRY)).toBe('no_tab');
    expect(apis.injectScript).not.toHaveBeenCalled();
    expect(apis.createTab).not.toHaveBeenCalled();
  });

  it.each([JOB_TAB, RESUME_TAB])('注入失敗（$url）：不開編輯器，在圖示上提示', async (tab) => {
    const apis = fakeApis(true);
    expect(await triggerCapture(tab, apis, REGISTRY)).toBe('inject_failed');
    expect(apis.createTab).not.toHaveBeenCalled();
    expect(apis.showTabNotice).toHaveBeenCalledExactlyOnceWith(7, INJECT_FAILED_NOTICE);
  });
});

describe('104 佔位 content script', () => {
  it('擷取不到就不送任何東西（R10）', async () => {
    const send = vi.fn(() => Promise.resolve());
    const result = await runSiteCapture(
      adapter104,
      {} as Document,
      'https://www.104.com.tw/job/x',
      send,
    );
    expect(result).toEqual({ status: 'not_captured', platform: '104' });
    expect(send).not.toHaveBeenCalled();
  });
});
