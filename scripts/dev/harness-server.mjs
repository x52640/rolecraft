/* global Buffer, URL */
// 開發用 harness 的 HTTP 伺服器（P1-T068）：提供編輯器頁、把橋接請求轉給 helper。
// 只供開發者自己的機器；安全限制（bind 127.0.0.1 由呼叫端負責）：
// - 每個請求檢查 Host（擋 DNS rebinding）
// - 頁面與橋接端點都要隨機 token；橋接端點只收同源 POST，不回任何 CORS 標頭
// - 橋接請求走擴充功能 service worker 同一段程式（isRelayMessage → handleRelay → createBridgeClient），
//   schema 與發送者檢查不比擴充功能寬鬆
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { handleRelay } from '../../apps/extension/src/relay/handler.ts';
import { isRelayMessage } from '../../apps/extension/src/relay/messages.ts';

export const BRIDGE_PATH = '/bridge';
export const TOKEN_HEADER = 'x-rolecraft-harness-token';
/** 編輯器 transport 讀這個 meta 判斷自己在 harness 頁（apps/editor/src/bridge/transport.ts）。 */
export const HARNESS_META = 'rolecraft-harness';
/** 與 helper 收件上限相同（apps/helper/src/bridge/framing.ts MAX_INCOMING_BYTES）。 */
export const MAX_BODY_BYTES = 1024 * 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function sameSecret(given, token) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 檢查請求是否可接受；回 null 表示通過，否則回 { status, message }。
 * Host 必須恰好是 127.0.0.1:<port>；橋接端點另外要求 POST、同源 Origin、token 標頭。
 */
export function checkRequest(req, { port, token }) {
  const origin = `http://127.0.0.1:${port}`;
  if (req.headers.host !== `127.0.0.1:${port}`) return { status: 421, message: 'Host 不符' };
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname === BRIDGE_PATH) {
    if (req.method !== 'POST') return { status: 405, message: '只接受 POST' };
    if (req.headers.origin !== origin) return { status: 403, message: '拒絕跨來源請求' };
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') {
      return { status: 403, message: '拒絕跨來源請求' };
    }
    if (!sameSecret(req.headers[TOKEN_HEADER], token))
      return { status: 403, message: 'token 不符' };
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return { status: 415, message: '只接受 application/json' };
    }
    return null;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return { status: 405, message: '只接受 GET' };
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!sameSecret(url.searchParams.get('token'), token)) {
      return { status: 403, message: 'token 不符' };
    }
  }
  return null;
}

/** 把 harness 設定放進編輯器 index.html（meta，不是腳本）；同時禁止 Referer 外流 token。 */
export function injectHarnessMeta(html, token) {
  const config = JSON.stringify({ endpoint: BRIDGE_PATH, token });
  const escaped = config.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const meta =
    `<meta name="referrer" content="no-referrer" />` +
    `<meta name="${HARNESS_META}" content="${escaped}" />`;
  return html.replace('</head>', `${meta}</head>`);
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveBridge(req, res, { client, extensionId }) {
  const raw = await readBody(req);
  if (raw === null) return send(res, 413, '請求超過 1 MiB');
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return send(res, 400, '不是合法 JSON');
  }
  if (!isRelayMessage(message)) return send(res, 400, '必須是 { channel, request }');
  // 等同擴充功能頁（編輯器）送出的訊息：與 service worker 走同一段驗證與轉送
  const sender = { id: extensionId, url: `chrome-extension://${extensionId}/editor/index.html` };
  const response = await handleRelay(message, sender, extensionId, client);
  send(res, 200, JSON.stringify(response), 'application/json; charset=utf-8');
}

async function serveStatic(req, res, { webRoot, token }) {
  const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.resolve(webRoot, relative);
  if (!file.startsWith(`${webRoot}${path.sep}`)) return send(res, 404, '找不到');
  let content;
  try {
    content = await readFile(file);
  } catch {
    return send(res, 404, '找不到');
  }
  const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
  if (relative === 'index.html') {
    return send(res, 200, injectHarnessMeta(content.toString('utf8'), token), type);
  }
  send(res, 200, content, type);
}

/** 回傳 node:http 的 request handler；port 用函式取，listen 後才知道（--port 0）。 */
export function createHarnessHandler({ token, client, extensionId, webRoot, port }) {
  const root = path.resolve(webRoot);
  return (req, res) => {
    const rejected = checkRequest(req, { port: port(), token });
    if (rejected) return send(res, rejected.status, rejected.message);
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
    const work =
      pathname === BRIDGE_PATH
        ? serveBridge(req, res, { client, extensionId })
        : serveStatic(req, res, { webRoot: root, token });
    work.catch(() => {
      if (!res.headersSent) send(res, 500, '伺服器錯誤');
      else res.destroy();
    });
  };
}
