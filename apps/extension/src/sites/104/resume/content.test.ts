// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://pda.104.com.tw/profile/edit?vno=fake#top"}
// 104 履歷頁腳本：每次注入只送一次，頁面之後的 DOM 事件與變動不會再觸發（P1-T076 對抗驗證提醒）。
// 頁面全是合成假資料。
import { RELAY_CHANNEL } from '@rolecraft/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE = `
  <div id="app"><div class="container-sidebar--rwd"><div class="row"><div class="col main">
    <div class="form-info"><span class="name__text">王假名</span></div>
    <h2>學歷</h2><p>虛構大學 測試系</p>
    <button>編輯</button>
  </div></div></div></div>`;

const sendMessage = vi.fn<(message: unknown) => Promise<unknown>>(() =>
  Promise.resolve({ ok: true }),
);

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** 模擬 service worker 注入一次：重新載入模組（模組頂層就是腳本本體）。 */
async function inject(): Promise<void> {
  vi.resetModules();
  await import('./content.ts');
  await flush();
}

/** 頁面在擷取後可能發生的各種事件與 DOM 變動。 */
async function pageActivity(): Promise<void> {
  for (const type of ['DOMContentLoaded', 'readystatechange', 'visibilitychange']) {
    document.dispatchEvent(new Event(type, { bubbles: true }));
  }
  for (const type of ['load', 'hashchange', 'popstate', 'focus', 'pageshow', 'scroll']) {
    window.dispatchEvent(new Event(type));
  }
  document.querySelector('button')?.click();
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const main = document.querySelector('.col.main');
  main?.append(Object.assign(document.createElement('p'), { textContent: '後來加的' }));
  main?.querySelector('p')?.remove();
  history.pushState({}, '', '/profile/edit?vno=fake2');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = PAGE;
  sendMessage.mockClear();
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState({}, '', '/profile/edit?vno=fake#top');
});

describe('104 履歷頁腳本（sites/104-resume）', () => {
  it('注入一次只送一次 submit_resume_capture，之後的頁面事件、DOM 變動都不再送', async () => {
    await inject();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const message = sendMessage.mock.calls[0]?.[0] as {
      channel: string;
      request: { op: string; payload: Record<string, unknown> };
    };
    expect(message.channel).toBe(RELAY_CHANNEL);
    expect(message.request.op).toBe('submit_resume_capture');
    expect(message.request.payload).toMatchObject({
      platform: '104',
      url: 'https://pda.104.com.tw/profile/edit',
      nameText: '王假名',
      truncated: false,
    });

    await pageActivity();
    await pageActivity();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('不在頁面上掛任何事件監聽', async () => {
    const onDoc = vi.spyOn(document, 'addEventListener');
    const onWin = vi.spyOn(window, 'addEventListener');
    const onBody = vi.spyOn(document.body, 'addEventListener');
    await inject();
    expect(onDoc).not.toHaveBeenCalled();
    expect(onWin).not.toHaveBeenCalled();
    expect(onBody).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('再注入一次（使用者再點一次）才會再送一次', async () => {
    await inject();
    await pageActivity();
    await inject();
    await pageActivity();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('找不到根節點：不送，之後頁面補上根節點也不會補送', async () => {
    document.body.innerHTML = '<div id="app"><p>別的頁</p></div>';
    await inject();
    document.body.innerHTML = PAGE;
    await pageActivity();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
