/* global process, Buffer */
// P1-T068 開發用 harness 測試：token／Host／來源檢查、選取器注入只在 harness 入口生效、轉送走真 helper。
// helper 子程序用真的 apps/helper/src/main.ts（經 harness-helper.mjs），只送不呼叫模型的操作；
// 不打包編輯器（build 注入假函式）、不碰家目錄（字型、資料區都用暫存目錄）。
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { HARNESS_PICKS_ENV, parsePicks, presetPickers } from './harness-helper.mjs';
import { parseHarnessCli, randomExtensionId, startHarness } from './harness.mjs';
import { checkRequest, injectHarnessMeta, TOKEN_HEADER } from './harness-server.mjs';

const MAIN = path.resolve(import.meta.dirname, '..', '..', 'apps', 'helper', 'src', 'main.ts');

function call(port, { method = 'GET', pathname = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe('checkRequest', () => {
  const opts = { port: 5000, token: 'a'.repeat(64) };
  const bridge = (headers) => ({
    method: 'POST',
    url: '/bridge',
    headers: {
      host: '127.0.0.1:5000',
      origin: 'http://127.0.0.1:5000',
      'content-type': 'application/json',
      [TOKEN_HEADER]: 'a'.repeat(64),
      ...headers,
    },
  });

  test('合法的橋接請求通過', () => {
    assert.equal(checkRequest(bridge({}), opts), null);
  });

  test('Host 不符（DNS rebinding、localhost、其他埠）一律拒', () => {
    for (const host of ['evil.example:5000', 'localhost:5000', '127.0.0.1:5001', undefined]) {
      assert.equal(checkRequest(bridge({ host }), opts)?.status, 421);
    }
  });

  test('缺 token 或 token 錯：拒', () => {
    assert.equal(checkRequest(bridge({ [TOKEN_HEADER]: undefined }), opts)?.status, 403);
    assert.equal(checkRequest(bridge({ [TOKEN_HEADER]: 'b'.repeat(64) }), opts)?.status, 403);
    assert.equal(checkRequest(bridge({ [TOKEN_HEADER]: 'a' }), opts)?.status, 403);
  });

  test('跨來源：Origin 不符、缺 Origin、Sec-Fetch-Site 非同源都拒', () => {
    assert.equal(checkRequest(bridge({ origin: 'https://evil.example' }), opts)?.status, 403);
    assert.equal(checkRequest(bridge({ origin: undefined }), opts)?.status, 403);
    assert.equal(checkRequest(bridge({ 'sec-fetch-site': 'cross-site' }), opts)?.status, 403);
    assert.equal(checkRequest(bridge({ 'sec-fetch-site': 'same-site' }), opts)?.status, 403);
  });

  test('橋接端點只收 POST＋JSON；頁面要 token', () => {
    assert.equal(checkRequest({ ...bridge({}), method: 'GET' }, opts)?.status, 405);
    assert.equal(checkRequest({ ...bridge({}), method: 'OPTIONS' }, opts)?.status, 405);
    assert.equal(checkRequest(bridge({ 'content-type': 'text/plain' }), opts)?.status, 415);
    const page = (url) => ({ method: 'GET', url, headers: { host: '127.0.0.1:5000' } });
    assert.equal(checkRequest(page('/'), opts)?.status, 403);
    assert.equal(checkRequest(page(`/?token=${'b'.repeat(64)}`), opts)?.status, 403);
    assert.equal(checkRequest(page(`/?token=${'a'.repeat(64)}`), opts), null);
    assert.equal(checkRequest(page('/assets/index.js'), opts), null);
  });
});

test('injectHarnessMeta：設定放在 meta（跳脫引號），並關掉 Referer', () => {
  const html = injectHarnessMeta('<html><head><title>x</title></head></html>', 'abc');
  assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
  assert.match(
    html,
    /<meta name="rolecraft-harness" content="\{&quot;endpoint&quot;:&quot;\/bridge&quot;,&quot;token&quot;:&quot;abc&quot;\}" \/>/,
  );
});

test('randomExtensionId：32 個 a–p', () => {
  assert.match(randomExtensionId(), /^[a-p]{32}$/);
});

describe('選取器注入', () => {
  let tmp;
  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-harness-pick-'));
  });
  after(() => rm(tmp, { recursive: true, force: true }));

  test('預設路徑經原本的解析與讀檔檢查：PDF 回檔名與內容、資料夾補結尾斜線', async () => {
    const pdf = path.join(tmp, 'cv.pdf');
    await writeFile(pdf, '%PDF-1.4\n%%EOF\n');
    const pickers = presetPickers({ pdf, folders: [tmp] });
    const picked = await pickers.pdf();
    assert.equal(picked.fileName, 'cv.pdf');
    assert.deepEqual(await pickers.folder(), [`${tmp}/`]);
  });

  test('沒指定等同取消；不是 PDF 照樣被擋', async () => {
    const none = presetPickers({ pdf: null, folders: [] });
    assert.equal(await none.pdf(), null);
    assert.deepEqual(await none.folder(), []);
    const txt = path.join(tmp, 'a.pdf');
    await writeFile(txt, 'not a pdf');
    await assert.rejects(presetPickers({ pdf: txt, folders: [] }).pdf(), { reason: 'not_pdf' });
  });

  test('parsePicks：只收絕對路徑', () => {
    assert.deepEqual(parsePicks(undefined), { pdf: null, folders: [] });
    assert.throws(() => parsePicks('{"pdf":"cv.pdf"}'));
    assert.throws(() => parsePicks('{"folders":["rel"]}'));
  });

  test('正式入口 main.ts 不讀 harness 環境變數、不認 harness 入口', async () => {
    const source = await readFile(MAIN, 'utf8');
    assert.ok(!source.includes(HARNESS_PICKS_ENV));
    assert.ok(!/harness/iu.test(source.replace(/\/\/.*|\/\*\*[^]*?\*\//gu, '')));
  });

  test('CLI：不存在的檔案、資料夾、埠號不合法都拒；相對路徑以 cwd 為基準', () => {
    assert.throws(() => parseHarnessCli(['--pdf', 'nope.pdf'], { cwd: tmp }), /找不到檔案/);
    assert.throws(() => parseHarnessCli(['--folders', 'nope'], { cwd: tmp }), /找不到資料夾/);
    assert.throws(() => parseHarnessCli(['--port', '70000'], { cwd: tmp }), /--port/);
    assert.throws(() => parseHarnessCli(['--unknown'], { cwd: tmp }));
    const parsed = parseHarnessCli(['--folders', '.', '--port', '0'], { cwd: tmp });
    assert.deepEqual(parsed.folders, [tmp]);
    assert.equal(parsed.pdf, null);
  });
});

describe('startHarness（真 helper 子程序）', () => {
  let tmp;
  let harness;
  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'rolecraft-harness-'));
    const web = path.join(tmp, 'web');
    const folder = path.join(tmp, 'project');
    await mkdir(folder);
    await writeFile(path.join(folder, 'notes.md'), '# notes\n');
    harness = await startHarness(
      { pdf: null, folders: [folder], port: 0, dataDir: path.join(tmp, 'data') },
      {
        build: async (out) => {
          await mkdir(out, { recursive: true });
          await writeFile(path.join(out, 'index.html'), '<html><head></head><body></body></html>');
        },
        webRoot: web,
        fontsDir: path.join(tmp, 'fonts'),
        env: { PATH: process.env.PATH },
      },
    );
  });
  after(async () => {
    await harness?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const bridgeCall = (request, headers = {}) =>
    call(harness.port, {
      method: 'POST',
      pathname: '/bridge',
      headers: {
        origin: `http://127.0.0.1:${harness.port}`,
        'content-type': 'application/json',
        [TOKEN_HEADER]: harness.token,
        ...headers,
      },
      body: JSON.stringify({ channel: 'rolecraft.bridge', request }),
    });

  test('頁面帶 token 才給，並注入 harness meta', async () => {
    assert.equal((await call(harness.port)).status, 403);
    const page = await call(harness.port, { pathname: `/?token=${harness.token}` });
    assert.equal(page.status, 200);
    assert.match(page.text, /name="rolecraft-harness"/);
    assert.equal(page.headers['access-control-allow-origin'], undefined);
  });

  test('沒 token、錯 Host 都拒，不轉給 helper', async () => {
    assert.equal(
      (await bridgeCall({ op: 'providers.status', payload: {} }, { [TOKEN_HEADER]: '' })).status,
      403,
    );
    assert.equal(
      (await bridgeCall({ op: 'providers.status', payload: {} }, { host: 'evil.test' })).status,
      421,
    );
  });

  test('帶 token：providers.status 由真 helper 回覆', async () => {
    const res = await bridgeCall({ op: 'providers.status', payload: {} });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.text);
    assert.equal(body.ok, true);
    assert.ok(body.services.some((s) => s.service === 'claude'));
  });

  test('選取器回傳預設資料夾；回應只有名稱、不含路徑', async () => {
    const res = JSON.parse((await bridgeCall({ op: 'sources.pick_folders', payload: {} })).text);
    assert.equal(res.ok, true);
    assert.ok(!JSON.stringify(res).includes(tmp));
    assert.ok(JSON.stringify(res).includes('project'));
  });

  test('schema 不符與非 { channel, request } 形狀照擴充功能規則拒', async () => {
    const bad = JSON.parse((await bridgeCall({ op: 'nope', payload: {} })).text);
    assert.equal(bad.error.code, 'invalid_request');
    const shape = await call(harness.port, {
      method: 'POST',
      pathname: '/bridge',
      headers: {
        origin: `http://127.0.0.1:${harness.port}`,
        'content-type': 'application/json',
        [TOKEN_HEADER]: harness.token,
      },
      body: JSON.stringify({ request: { op: 'providers.status', payload: {} } }),
    });
    assert.equal(shape.status, 400);
  });
});
