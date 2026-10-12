/**
 * 履歷頁擷取結果的頁面內提示（web-resume-capture「擷取結果」）。
 * 比照 `sites/104/notice.ts`：shadow DOM 隔開網頁樣式、只放純文字（textContent），不插入 HTML。
 * 成功不在頁面提示（service worker 會開編輯器）。
 */

export const RESUME_NOTICE_HOST_ID = 'rolecraft-resume-capture-notice';
const AUTO_DISMISS_MS = 12_000;

/** 找不到本文根節點：不送任何東西（文字照規格）。 */
export const RESUME_NOT_FOUND_MESSAGE =
  'RoleCraft：這一頁找不到履歷內容（可能不是支援的履歷檢視頁，或網站改版了），沒有擷取或送出任何內容。可以到 RoleCraft 編輯器改用「手動輸入」（在其他分頁點 RoleCraft 圖示開啟）。';

/** 送出後失敗（helper 連不上、被拒、不符 schema）：現行擷取失敗提示改成指向「手動輸入」。 */
export const RESUME_FAILED_MESSAGE =
  'RoleCraft：擷取失敗，已停止，這次沒有匯入任何內容。請到 RoleCraft 編輯器改用「手動輸入」（在其他分頁點 RoleCraft 圖示開啟）。';

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
export function showResumeNotice(doc: Document, text: string): HTMLElement {
  doc.getElementById(RESUME_NOTICE_HOST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = RESUME_NOTICE_HOST_ID;
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
