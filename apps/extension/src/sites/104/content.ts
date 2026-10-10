// 104 content script 入口（打包成 sites/104.js，只在使用者觸發時注入）。
// 擷取不到或轉送失敗就停止，並在頁面上提示改用手動貼上（R10）。
import { runSiteCapture } from '../runtime.ts';
import { adapter104 } from './adapter.ts';
import { captureNoticeText, showCaptureNotice } from './notice.ts';

void runSiteCapture(adapter104, document, location.href, (message) =>
  chrome.runtime.sendMessage(message),
)
  .then(captureNoticeText, () => captureNoticeText({ status: 'error' }))
  .then((text) => {
    if (text !== null) showCaptureNotice(document, text);
  });
