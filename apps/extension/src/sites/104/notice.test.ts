// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FAILED_MESSAGE,
  NOT_SUPPORTED_MESSAGE,
  NOTICE_HOST_ID,
  captureNoticeText,
  showCaptureNotice,
} from './notice.ts';

function noticeText(): string | null | undefined {
  const host = document.getElementById(NOTICE_HOST_ID);
  return host?.shadowRoot?.querySelector('[role="alert"] span')?.textContent;
}

describe('captureNoticeText', () => {
  it('擷取不到：提示尚未支援、改用手動貼上', () => {
    expect(captureNoticeText({ status: 'not_captured', platform: '104' })).toBe(
      NOT_SUPPORTED_MESSAGE,
    );
    expect(NOT_SUPPORTED_MESSAGE).toContain('手動貼上');
  });

  it('轉送失敗或回應 ok:false：提示失敗', () => {
    expect(captureNoticeText({ status: 'error' })).toBe(FAILED_MESSAGE);
    expect(captureNoticeText({ status: 'sent', platform: '104', response: { ok: false } })).toBe(
      FAILED_MESSAGE,
    );
  });

  it('成功送出不提示', () => {
    expect(
      captureNoticeText({ status: 'sent', platform: '104', response: { ok: true } }),
    ).toBeNull();
  });
});

describe('showCaptureNotice', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('頁面上出現可見提示，文字不當 HTML 解析，重複觸發只留一個', () => {
    showCaptureNotice(document, '<b>x</b>');
    showCaptureNotice(document, NOT_SUPPORTED_MESSAGE);
    expect(document.querySelectorAll(`#${NOTICE_HOST_ID}`)).toHaveLength(1);
    expect(noticeText()).toBe(NOT_SUPPORTED_MESSAGE);
    expect(document.getElementById(NOTICE_HOST_ID)?.shadowRoot?.querySelector('b')).toBeNull();
  });

  it('按關閉就移除', () => {
    const host = showCaptureNotice(document, FAILED_MESSAGE);
    host.shadowRoot?.querySelector('button')?.click();
    expect(document.getElementById(NOTICE_HOST_ID)).toBeNull();
  });
});

describe('104 content script（回歸：擷取失敗不能只寫 console）', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    sendMessage.mockReset();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('適配器擷取不到：不送任何訊息，頁面顯示改用手動貼上的提示', async () => {
    await import('./content.ts');
    await vi.waitFor(() => expect(noticeText()).toBe(NOT_SUPPORTED_MESSAGE));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
