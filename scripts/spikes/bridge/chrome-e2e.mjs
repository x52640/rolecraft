/* global process, console, Buffer, setTimeout */
// Chrome 實測（可重跑）：用「拋棄式暫存 profile」啟動 Chrome，不碰使用者的 profile 與家目錄下的 host 註冊。
//   node scripts/spikes/bridge/chrome-e2e.mjs [--browser-path <Chrome 執行檔>] [--headful]
// 做法：--user-data-dir 指到暫存目錄（使用者層級 host manifest 會在 <user-data-dir>/NativeMessagingHosts 找），
// 用 CDP pipe 的 Extensions.loadUnpacked 載入原型（需 --enable-unsafe-extension-debugging），
// 在 service worker 與擴充功能頁各跑一次 echo 自我測試，再載入第二份（不同 ID）確認被 allowed_origins 擋下。
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { install } from './install.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
      if (msg.id && waiters.has(msg.id)) {
        const { resolve, reject } = waiters.get(msg.id);
        waiters.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`));
        else resolve(msg.result);
      }
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiters.set(id, { resolve, reject });
      const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
      toChrome.write(`${JSON.stringify(payload)}\0`);
    });
}

// service worker 的 module 可能還沒跑完；輪詢等 runSelfTest 出現（SW 不能用動態 import）。
const WORKER_SELFTEST =
  'new Promise((ok) => { const t = () => (globalThis.runSelfTest ? ok(globalThis.runSelfTest()) : setTimeout(t, 50)); t(); })';

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

async function main() {
  const { values } = parseArgs({
    options: {
      'browser-path': { type: 'string', default: DEFAULT_CHROME },
      headful: { type: 'boolean', default: false },
    },
  });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-bridge-e2e-'));
  const profile = path.join(tmp, 'profile');
  const extA = path.join(tmp, 'ext-allowed');
  const extB = path.join(tmp, 'ext-other');
  await cp(path.join(HERE, 'extension'), extA, { recursive: true });
  await cp(path.join(HERE, 'extension'), extB, { recursive: true });

  const args = [
    `--user-data-dir=${profile}`,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    ...(values.headful ? [] : ['--headless=new']),
    'about:blank',
  ];
  const chrome = spawn(values['browser-path'], args, {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  chrome.stdio[2].on('data', (chunk) => (stderr += chunk));
  const send = cdpOverPipe(chrome);
  const report = { browser: null, allowed: null, other: null };
  try {
    report.browser = (await send('Browser.getVersion')).product;
    const { id: idA } = await send('Extensions.loadUnpacked', { path: extA });
    const { id: idB } = await send('Extensions.loadUnpacked', { path: extB });
    await install({
      dir: path.join(profile, 'NativeMessagingHosts'),
      extensionId: idA,
      apply: true,
    });

    const swA = await findTarget(
      send,
      (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${idA}/`),
    );
    const worker = await evaluateIn(send, swA.targetId, WORKER_SELFTEST);
    const { targetId: pageId } = await send('Target.createTarget', {
      url: `chrome-extension://${idA}/page.html`,
    });
    await sleep(500);
    const page = await evaluateIn(
      send,
      pageId,
      "import('./selftest.js').then((m) => m.runSelfTest())",
    );
    report.allowed = { extensionId: idA, worker, page };

    const swB = await findTarget(
      send,
      (t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${idB}/`),
    );
    report.other = {
      extensionId: idB,
      worker: await evaluateIn(send, swB.targetId, WORKER_SELFTEST),
    };
  } catch (err) {
    report.error = String(err.message ?? err);
    report.chromeStderrTail = stderr.split('\n').slice(-15).join('\n');
  } finally {
    chrome.kill();
    await sleep(500);
    await rm(tmp, { recursive: true, force: true });
  }

  const ok = (r) => r && !r.error && r.results.length === 4 && r.results.every((x) => x.pass);
  const pass =
    ok(report.allowed?.worker) &&
    ok(report.allowed?.page) &&
    /forbidden/i.test(report.other?.worker.error ?? '');
  console.log(JSON.stringify(report, null, 2));
  console.log(pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}

await main();
