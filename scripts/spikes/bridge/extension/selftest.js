/* global chrome, setTimeout, clearTimeout */
// 共用自我測試：在擴充功能頁或 service worker 用 connectNative 連 host，跑固定案例。
export const HOST_NAME = 'com.rolecraft.bridge_spike';

const CASES = [
  { name: 'ping', send: { id: 'c1', op: 'ping' }, expect: (r) => r.ok && r.result.pong === true },
  {
    name: 'echo 中文',
    send: { id: 'c2', op: 'echo', text: '履歷 ✓ résumé' },
    expect: (r) => r.ok && r.result.text === '履歷 ✓ résumé',
  },
  {
    name: '拒絕未知操作',
    send: { id: 'c3', op: 'exec', cmd: 'ls' },
    expect: (r) => !r.ok && r.error.code === 'unknown_op',
  },
  {
    name: '拒絕多餘的 path 欄位',
    send: { id: 'c4', op: 'echo', text: 'x', path: '/etc/passwd' },
    expect: (r) => !r.ok && r.error.code === 'unexpected_field',
  },
];

export const CASE_COUNT = CASES.length;

/** 連線、送出所有案例、收齊回覆後斷線。回傳每案結果與連線錯誤。 */
export function runSelfTest(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const results = [];
    let port;
    let done = false;
    const context = globalThis.document ? 'extension-page' : 'service-worker';
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        port?.disconnect();
      } catch {
        // 已斷線
      }
      resolve({ context, error, results });
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    try {
      port = chrome.runtime.connectNative(HOST_NAME);
    } catch (err) {
      finish(String(err));
      return;
    }
    port.onDisconnect.addListener(() => {
      finish(chrome.runtime.lastError?.message ?? 'disconnected');
    });
    port.onMessage.addListener((reply) => {
      const testCase = CASES.find((c) => c.send.id === reply.id);
      results.push({
        name: testCase?.name ?? reply.id,
        pass: Boolean(testCase?.expect(reply)),
        reply,
      });
      if (results.length === CASES.length) finish(null);
    });
    for (const c of CASES) port.postMessage(c.send);
  });
}

/** 開系統資料夾選取器（需要使用者操作，只供手動驗證）。 */
export function pickFolders() {
  return chrome.runtime.sendNativeMessage(HOST_NAME, { id: 'pick', op: 'pickFolders' });
}
