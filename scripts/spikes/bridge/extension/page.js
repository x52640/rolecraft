/* global chrome, document */
// 測試頁（模擬未來的編輯器分頁）：從擴充功能頁與 service worker 兩個環境各跑一次。
import { CASE_COUNT, pickFolders, runSelfTest } from './selftest.js';

const out = document.getElementById('out');
const summary = document.getElementById('summary');
document.getElementById('ext-id').textContent = chrome.runtime.id;

function show(label, value) {
  out.textContent += `${label}\n${JSON.stringify(value, null, 2)}\n\n`;
}

document.getElementById('run').addEventListener('click', async () => {
  out.textContent = '';
  const page = await runSelfTest();
  show('擴充功能頁', page);
  const worker = await chrome.runtime.sendMessage({ type: 'runSelfTestInWorker' });
  show('service worker', worker);
  const all = [...page.results, ...worker.results];
  const total = CASE_COUNT * 2;
  const pass = !page.error && !worker.error && all.length === total && all.every((r) => r.pass);
  summary.textContent = pass ? `PASS：${total}/${total}` : 'FAIL：請把下方輸出整段貼回';
});

document.getElementById('pick').addEventListener('click', async () => {
  try {
    show('pickFolders', await pickFolders());
  } catch (err) {
    show('pickFolders 錯誤', String(err));
  }
});
