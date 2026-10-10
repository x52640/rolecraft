import { describe, expect, it, vi } from 'vitest';

import { runSiteCapture } from '../sites/runtime.ts';
import { adapter104 } from '../sites/104/adapter.ts';
import { openEditor, triggerCapture, type ActionApis } from './actions.ts';

function fakeApis() {
  return {
    getURL: vi.fn((p: string) => `chrome-extension://id/${p}`),
    createTab: vi.fn(() => Promise.resolve()),
    injectScript: vi.fn(() => Promise.resolve()),
    showTabNotice: vi.fn(() => Promise.resolve()),
  } satisfies ActionApis;
}

describe('toolbar / capture actions', () => {
  it('工具列按鈕開編輯器擴充功能頁', async () => {
    const apis = fakeApis();
    await openEditor(apis);
    expect(apis.createTab).toHaveBeenCalledWith('chrome-extension://id/editor/index.html');
  });

  it('104 職缺頁：注入 104 content script', async () => {
    const apis = fakeApis();
    const result = await triggerCapture({ id: 7, url: 'https://www.104.com.tw/job/x' }, apis);
    expect(result).toBe('injected');
    expect(apis.injectScript).toHaveBeenCalledWith(7, 'sites/104.js');
  });

  it('不支援的頁面：不注入，只提示', async () => {
    const apis = fakeApis();
    const result = await triggerCapture({ id: 7, url: 'https://www.linkedin.com/jobs/1' }, apis);
    expect(result).toBe('unsupported_page');
    expect(apis.injectScript).not.toHaveBeenCalled();
    expect(apis.showTabNotice).toHaveBeenCalledOnce();
  });

  it('沒有分頁：什麼都不做', async () => {
    const apis = fakeApis();
    expect(await triggerCapture(undefined, apis)).toBe('no_tab');
    expect(apis.injectScript).not.toHaveBeenCalled();
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
