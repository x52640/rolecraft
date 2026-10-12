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
 * 解析請求目標：解碼、正規化後的路徑（授權與送檔共用這一份，P1-T068 對抗驗證）。
 * 解碼或解析失敗（例如 `//[`、`%E0`）、含 NUL 回 null。
 * page：相對 webRoot 的檔案路徑，`/` 視為 index.html；isIndex 不分大小寫（macOS 檔案系統不分）。
 */
export function resolveTarget(rawUrl) {
  let url;
  let decoded;
  try {
    url = new URL(rawUrl ?? '/', 'http://127.0.0.1');
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const pathname = path.posix.normalize(decoded);
  const relative = pathname.replace(/^\/+/u, '');
  const page = relative === '' ? 'index.html' : relative;
  return {
    pathname,
    page,
    isIndex: page.toLowerCase() === 'index.html',
    token: url.searchParams.get('token'),
  };
}

/**
 * 檢查請求；回 { target } 表示通過，否則回 { rejected: { status, message } }。
 * Host 必須恰好是 127.0.0.1:<port>；橋接端點另外要求 POST、同源 Origin、token 標頭；頁面要 ?token=。
 */
export function inspectRequest(req, { port, token }) {
  const origin = `http://127.0.0.1:${port}`;
  const reject = (status, message) => ({ rejected: { status, message } });
  if (req.headers.host !== `127.0.0.1:${port}`) return reject(421, 'Host 不符');
  const target = resolveTarget(req.url);
  if (!target) return reject(400, '請求路徑格式錯誤');
  if (target.pathname === BRIDGE_PATH) {
    if (req.method !== 'POST') return reject(405, '只接受 POST');
    if (req.headers.origin !== origin) return reject(403, '拒絕跨來源請求');
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') return reject(403, '拒絕跨來源請求');
    if (!sameSecret(req.headers[TOKEN_HEADER], token)) return reject(403, 'token 不符');
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return reject(415, '只接受 application/json');
    }
    return { target };
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return reject(405, '只接受 GET');
  if (target.isIndex && !sameSecret(target.token, token)) return reject(403, 'token 不符');
  return { target };
}

/** inspectRequest 的簡化版：回 null 表示通過，否則回 { status, message }。 */
export function checkRequest(req, options) {
  return inspectRequest(req, options).rejected ?? null;
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

/** 送靜態檔；target 是 inspectRequest 已授權的同一份解碼後路徑。 */
async function serveStatic(res, { webRoot, token, target }) {
  const file = path.resolve(webRoot, target.page);
  if (!file.startsWith(`${webRoot}${path.sep}`)) return send(res, 404, '找不到');
  let content;
  try {
    content = await readFile(file);
  } catch {
    return send(res, 404, '找不到');
  }
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  if (target.isIndex) {
    return send(res, 200, injectHarnessMeta(content.toString('utf8'), token), type);
  }
  send(res, 200, content, type);
}

/** 回傳 node:http 的 request handler；port 用函式取，listen 後才知道（--port 0）。 */
export function createHarnessHandler({ token, client, extensionId, webRoot, port }) {
  const root = path.resolve(webRoot);
  return (req, res) => {
    let checked;
    try {
      checked = inspectRequest(req, { port: port(), token });
    } catch {
      checked = { rejected: { status: 400, message: '請求格式錯誤' } };
    }
    const { rejected, target } = checked;
    if (rejected) return send(res, rejected.status, rejected.message);
    const work =
      target.pathname === BRIDGE_PATH
        ? serveBridge(req, res, { client, extensionId })
        : serveStatic(res, { webRoot: root, token, target });
    work.catch(() => {
      if (!res.headersSent) send(res, 500, '伺服器錯誤');
      else res.destroy();
    });
  };
}
