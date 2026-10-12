// service worker 入口：唯一持有 Native Messaging 連線的地方（ADR-0003）。
// 開編輯器只由 service worker 直接開分頁（點圖示、履歷擷取成功），不經 helper（bridge.md）。
import { NATIVE_HOST_NAME } from '@rolecraft/contracts';

import { createBridgeClient } from '../bridge/client.ts';
import { CAPTURE_COMMAND } from '../manifest.ts';
import { handleRelay } from '../relay/handler.ts';
import { isRelayMessage } from '../relay/messages.ts';
import { handleActionClick, openEditor, triggerCapture, type ActionApis } from './actions.ts';

const client = createBridgeClient({
  connect: () => chrome.runtime.connectNative(NATIVE_HOST_NAME),
  lastError: () => chrome.runtime.lastError?.message,
});

const apis: ActionApis = {
  getURL: (path) => chrome.runtime.getURL(path),
  createTab: (url) => chrome.tabs.create({ url }),
  injectScript: (tabId, file) =>
    chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [file] }),
  showTabNotice: async (tabId, title) => {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setTitle({ tabId, title });
  },
};

// 點圖示：履歷頁 → 注入履歷頁腳本；其他頁面照舊開編輯器（web-resume-capture「觸發」）。
chrome.action.onClicked.addListener((tab) => {
  handleActionClick(tab, apis).catch((err: unknown) => {
    console.error('RoleCraft：處理工具列圖示失敗', err);
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== CAPTURE_COMMAND) return;
  triggerCapture(tab, apis).catch((err: unknown) => {
    console.error('RoleCraft：處理擷取快捷鍵失敗', err);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isRelayMessage(message)) return false;
  void handleRelay(message, sender, chrome.runtime.id, client, {
    onResumeCaptured: () => openEditor(apis),
  }).then(sendResponse);
  return true; // 非同步回覆
});
