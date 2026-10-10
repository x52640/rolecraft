/* global process, console, Buffer, setTimeout */
// Chrome 自動實測（可重跑）：先 `npm run build -w @rolecraft/extension`，再
//   node apps/extension/scripts/chrome-e2e.mjs [--browser-path <Chrome 執行檔>] [--headful]
// 拋棄式暫存 profile（不碰使用者 profile 與家目錄的 host 註冊）；假 host manifest 寫進暫存 profile。
// 檢查：載入 dist/unpacked、service worker 啟動、編輯器頁（apps/editor）載入與路由、經 service worker 轉送的橋接往返
// （合法請求、schema 不合法請求不送出、host 回不合法回應被擋）。
// 工具列按鈕與快捷鍵注入無法用 CDP 觸發，見 Task 手動驗證步驟。
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { EDITOR_PAGE, NATIVE_HOST_NAME, RELAY_CHANNEL } from '../src/index.ts';

const APP = path.resolve(import.meta.dirname, '..');
const UNPACKED = path.join(APP, 'dist', 'unpacked');
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 假 host：Native Messaging 框（4 bytes 小端長度＋JSON）。收到的訊息逐行記到 log。
// open_editor 回合法回應；request_draft 故意回型別錯誤的回應。
const FAKE_HOST = `
import { appendFileSync } from 'node:fs';
const LOG = process.argv[2];
let buf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) return;
    const msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
    buf = buf.subarray(4 + len);
    appendFileSync(LOG, JSON.stringify(msg) + '\\n');
    const reply = msg.op === 'request_draft' ? { ok: true, workJobId: 123 } : { ok: true };
    const out = Buffer.from(JSON.stringify(reply), 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(out.length, 0);
    process.stdout.write(Buffer.concat([head, out]));
  }
});
`;

function cdpOverPipe(child) {
  const toChrome = child.stdio[3];
  const fromChrome = child.stdio[4];
  let nextId = 1;
  let pending = Buffer.alloc(0);
  const waiters = new Map();
  fromChrome.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    let end;
    while ((end = pending.indexOf(0)) !== -1) {
      const msg = JSON.parse(pending.subarray(0, end).toString('utf8'));
      pending = pending.subarray(end + 1);
      const w = msg.id && waiters.get(msg.id);
      if (!w) continue;
      waiters.delete(msg.id);
      if (msg.error) w.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
      else w.resolve(msg.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiters.set(id, { resolve, reject });
      toChrome.write(
        `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
      );
    });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluateIn(send, targetId, expression) {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const { result, exceptionDetails } = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
  return result.value;
}

async function findTarget(send, predicate) {
  for (let i = 0; i < 50; i++) {
    const { targetInfos } = await send('Target.getTargets');
    const hit = targetInfos.find(predicate);
    if (hit) return hit;
    await sleep(100);
  }
  throw new Error('找不到目標 target');
}

async function writeFakeHost(tmp, profile) {
  const hostScript = path.join(tmp, 'fake-host.mjs');
  const log = path.join(tmp, 'host.log');
  const wrapper = path.join(tmp, 'fake-host.sh');
  await writeFile(hostScript, FAKE_HOST);
  await writeFile(log, '');
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${hostScript}" "${log}"\n`);
  await chmod(wrapper, 0o755);
  return { log, wrapper, profileHosts: path.join(profile, 'NativeMessagingHosts') };
}

const EDITOR_PROBE = `({
  marker: document.body.dataset.rolecraftEditor,
  heading: document.querySelector('h1')?.textContent,
  navCount: document.querySelectorAll('nav a').length,
})`;
const ROUTE_PROBE = `new Promise((resolve) => {
  location.hash = '#/jobs';
  setTimeout(() => resolve(document.querySelector('h1')?.textContent), 200);
})`;

const CASES = [
  { name: '合法 open_editor', request: { op: 'open_editor', payload: {} }, expect: { ok: true } },
  {
    name: '多帶 path 欄位：不送出',
    request: { op: 'open_editor', payload: { path: '/etc/passwd' } },
    expectCode: 'invalid_request',
  },
  {
    name: '未知操作：不送出',
    request: { op: 'run_command', payload: { cmd: 'ls' } },
    expectCode: 'invalid_request',
  },
  {
    name: 'host 回應不符 schema：擋下',
    request: { op: 'request_draft', payload: { messageDraftId: 'm-1', replyIntent: '婉拒' } },
    expectCode: 'internal_error',
  },
];

async function main() {
  const { values } = parseArgs({
    options: {
      'browser-path': { type: 'string', default: DEFAULT_CHROME },
      headful: { type: 'boolean', default: false },
    },
  });
  JSON.parse(await readFile(path.join(UNPACKED, 'manifest.json'), 'utf8')); // 沒打包就失敗
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-ext-e2e-'));
  const profile = path.join(tmp, 'profile');
  const host = await writeFakeHost(tmp, profile);
  const chrome = spawn(
    values['browser-path'],
    [
      `--user-data-dir=${profile}`,
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
      ...(values.headful ? [] : ['--headless=new']),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  chrome.stdio[2].on('data', (chunk) => (stderr += chunk));
  const send = cdpOverPipe(chrome);
  const report = { browser: null, extensionId: null, results: [] };
  try {
    report.browser = (await send('Browser.getVersion')).product;
    const { id } = await send('Extensions.loadUnpacked', { path: UNPACKED });
    report.extensionId = id;
    await mkdir(host.profileHosts, { recursive: true });
    await writeFile(
      path.join(host.profileHosts, `${NATIVE_HOST_NAME}.json`),
      JSON.stringify({
        name: NATIVE_HOST_NAME,
        description: 'RoleCraft e2e fake host',
        path: host.wrapper,
        type: 'stdio',
        allowed_origins: [`chrome-extension://${id}/`],
      }),
    );
    const prefix = `chrome-extension://${id}/`;
    await findTarget(send, (t) => t.type === 'service_worker' && t.url.startsWith(prefix));
    report.results.push({ name: 'service worker 啟動', pass: true });

    const { targetId } = await send('Target.createTarget', { url: `${prefix}${EDITOR_PAGE}` });
    await sleep(500);
    const page = await evaluateIn(send, targetId, EDITOR_PROBE);
    report.results.push({
      name: '編輯器（React）載入並顯示匯入頁',
      pass: page.marker === 'ready' && page.heading === '匯入' && page.navCount === 7,
      got: page,
    });
    const routed = await evaluateIn(send, targetId, ROUTE_PROBE);
    report.results.push({
      name: '編輯器 hash 路由切到職缺頁',
      pass: routed === '職缺',
      got: routed,
    });

    for (const c of CASES) {
      const message = JSON.stringify({ channel: RELAY_CHANNEL, request: c.request });
      const got = await evaluateIn(send, targetId, `chrome.runtime.sendMessage(${message})`);
      const pass = c.expect
        ? JSON.stringify(got) === JSON.stringify(c.expect)
        : got?.ok === false && got.error?.code === c.expectCode;
      report.results.push({ name: c.name, pass, got });
    }
    const received = (await readFile(host.log, 'utf8')).trim().split('\n').filter(Boolean);
    const ops = received.map((line) => JSON.parse(line).op);
    report.results.push({
      name: 'host 只收到合法請求',
      pass: JSON.stringify(ops) === JSON.stringify(['open_editor', 'request_draft']),
      got: ops,
    });
  } catch (err) {
    report.error = String(err.message ?? err);
    report.chromeStderrTail = stderr.split('\n').slice(-15).join('\n');
  } finally {
    chrome.kill();
    await sleep(500);
    await rm(tmp, { recursive: true, force: true });
  }
  const pass = !report.error && report.results.length > 0 && report.results.every((r) => r.pass);
  console.log(JSON.stringify(report, null, 2));
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}

await main();
