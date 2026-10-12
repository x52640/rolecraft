// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RESUME_FAILED_MESSAGE,
  RESUME_NOT_FOUND_MESSAGE,
  RESUME_NOTICE_HOST_ID,
  showResumeNotice,
} from './notice.ts';
import { startResumeCapture } from './start.ts';

function noticeText(): string | null | undefined {
  const host = document.getElementById(RESUME_NOTICE_HOST_ID);
  return host?.shadowRoot?.querySelector('[role="alert"] span')?.textContent;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('showResumeNotice', () => {
  it('shadow DOM 純文字、不當 HTML 解析，重複觸發只留一個', () => {
    showResumeNotice(document, '<b>x</b>');
    showResumeNotice(document, RESUME_FAILED_MESSAGE);
    expect(document.querySelectorAll(`#${RESUME_NOTICE_HOST_ID}`)).toHaveLength(1);
    expect(noticeText()).toBe(RESUME_FAILED_MESSAGE);
    expect(
      document.getElementById(RESUME_NOTICE_HOST_ID)?.shadowRoot?.querySelector('b'),
    ).toBeNull();
  });

  it('按關閉就移除', () => {
    const host = showResumeNotice(document, RESUME_NOT_FOUND_MESSAGE);
    host.shadowRoot?.querySelector('button')?.click();
    expect(document.getElementById(RESUME_NOTICE_HOST_ID)).toBeNull();
  });
});

describe('startResumeCapture（頁面入口）', () => {
  it('找不到根節點：不送任何訊息，頁面顯示找不到履歷內容的提示', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    document.body.innerHTML = '<p>不是履歷頁</p>';
    await startResumeCapture({ platform: '104', rootSelector: '#resume' });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(noticeText()).toBe(RESUME_NOT_FOUND_MESSAGE);
  });
});
