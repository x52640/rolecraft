/* global chrome */
// service worker：點工具列圖示開測試頁；也接受自家頁面的自我測試請求（只認自己的 extension id）。
import { runSelfTest } from './selftest.js';

globalThis.runSelfTest = runSelfTest;

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('page.html') });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'runSelfTestInWorker') return false;
  void runSelfTest().then(sendResponse);
  return true;
});
