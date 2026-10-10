// 104 content script 入口（打包成 sites/104.js，只在使用者觸發時注入）。
import { runSiteCapture } from '../runtime.ts';
import { adapter104 } from './adapter.ts';

void runSiteCapture(adapter104, document, location.href, (message) =>
  chrome.runtime.sendMessage(message),
).then((result) => {
  if (result.status === 'not_captured') {
    console.info('RoleCraft：104 自動擷取尚未支援，請改用編輯器手動貼上。');
  }
});
