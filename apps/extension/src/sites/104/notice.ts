/**
 * 擷取結果的頁面內提示（R10：擷取失敗就停止並提示，不產生假資料）。
 * content script 已經因使用者觸發而注入，直接在頁面畫提示，不需要額外權限（不用 badge／通知）。
 * 用 shadow DOM 隔開網頁樣式；只放純文字（textContent），不插入任何 HTML。
 */
import type { SiteRunResult } from '../runtime.ts';

export const NOTICE_HOST_ID = 'rolecraft-capture-notice';
const AUTO_DISMISS_MS = 12_000;

export const NOT_SUPPORTED_MESSAGE =
  'RoleCraft：104 自動擷取尚未支援，沒有讀取任何內容。請到 RoleCraft 編輯器改用「手動貼上」。';
export const FAILED_MESSAGE =
  'RoleCraft：擷取失敗，已停止，這次沒有匯入任何內容。請到 RoleCraft 編輯器改用「手動貼上」。';

function isFailedResponse(response: unknown): boolean {
  return (
    typeof response === 'object' && response !== null && 'ok' in response && response.ok === false
  );
}

/** 要提示使用者的文字；成功送出回 null。 */
export function captureNoticeText(outcome: SiteRunResult | { status: 'error' }): string | null {
  if (outcome.status === 'not_captured') return NOT_SUPPORTED_MESSAGE;
  if (outcome.status === 'error') return FAILED_MESSAGE;
  return isFailedResponse(outcome.response) ? FAILED_MESSAGE : null;
}

const STYLE = `
:host { all: initial; }
.box {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647; max-width: 360px;
  display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px;
  background: #fff8e1; color: #3e2723; border: 1px solid #f9a825; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.18); font: 14px/1.5 system-ui, sans-serif;
}
button { all: unset; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; }
button:focus-visible { outline: 2px solid #f9a825; border-radius: 4px; }
`;

/** 在頁面右上角顯示提示；重複觸發會取代舊的提示。 */
export function showCaptureNotice(doc: Document, text: string): HTMLElement {
  doc.getElementById(NOTICE_HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = NOTICE_HOST_ID;
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const box = doc.createElement('div');
  box.className = 'box';
  box.setAttribute('role', 'alert');
  const message = doc.createElement('span');
  message.textContent = text;
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '關閉提示');
  close.addEventListener('click', () => host.remove());
  box.append(message, close);
  root.append(style, box);
  (doc.body ?? doc.documentElement).append(host);
  doc.defaultView?.setTimeout(() => host.remove(), AUTO_DISMISS_MS);
  return host;
}
