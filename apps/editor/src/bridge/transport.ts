import { RELAY_CHANNEL } from '@rolecraft/contracts';

/**
 * 編輯器頁 → service worker 的轉送通道（ADR-0003）。
 * 編輯器不直接連 Native Messaging，只能把橋接請求包成 { channel, request } 交給 service worker；
 * service worker 再驗 schema 與發送者、配請求 id 後才送給本機輔助程式。
 * 通道名稱唯一定義在 contracts，與擴充功能共用。
 */
export { RELAY_CHANNEL };

/** 送出一則已驗證的橋接請求，回傳 service worker 的原始回覆（尚未驗證）。 */
export interface BridgeTransport {
  send(request: unknown): Promise<unknown>;
}

/** chrome.runtime 中用到的部分。 */
interface RuntimeLike {
  id?: string;
  sendMessage(message: unknown): Promise<unknown>;
}

function currentRuntime(): RuntimeLike | undefined {
  const chromeGlobal = (globalThis as { chrome?: { runtime?: RuntimeLike } }).chrome;
  const runtime = chromeGlobal?.runtime;
  // 一般網頁也可能有 chrome.runtime 物件，但沒有 id；只有擴充功能頁才有。
  return runtime?.id && typeof runtime.sendMessage === 'function' ? runtime : undefined;
}

/** 擴充功能頁的轉送通道；不在擴充功能頁內（例如單獨開 HTML）時回 null。 */
export function createRuntimeTransport(runtime = currentRuntime()): BridgeTransport | null {
  if (!runtime) return null;
  return {
    send: (request) => runtime.sendMessage({ channel: RELAY_CHANNEL, request }),
  };
}

/**
 * 開發用 harness（P1-T068，scripts/dev/harness.mjs）注入的設定：只在 harness 伺服器回的 index.html 裡
 * 以 <meta name="rolecraft-harness"> 出現；擴充功能打包出的頁面沒有這個 meta。
 */
export const HARNESS_META_NAME = 'rolecraft-harness';
export const HARNESS_TOKEN_HEADER = 'x-rolecraft-harness-token';

export interface HarnessConfig {
  readonly endpoint: string;
  readonly token: string;
}

/** 讀 harness meta；沒有或格式不符回 null。endpoint 只接受同源的絕對路徑。 */
export function readHarnessConfig(
  doc: Document | undefined = globalThis.document,
): HarnessConfig | null {
  const meta = doc?.querySelector(`meta[name="${HARNESS_META_NAME}"]`);
  const content = meta?.getAttribute('content');
  if (!content) return null;
  try {
    const { endpoint, token } = JSON.parse(content) as { endpoint?: unknown; token?: unknown };
    if (typeof endpoint !== 'string' || !/^\/[a-z-]+$/u.test(endpoint)) return null;
    if (typeof token !== 'string' || !/^[0-9a-f]{16,128}$/u.test(token)) return null;
    return { endpoint, token };
  } catch {
    return null;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** harness 頁的轉送通道：POST 到同源端點，內容形狀同送給 service worker 的 { channel, request }。 */
export function createHarnessTransport(
  config: HarnessConfig,
  fetchFn: FetchLike = (input, init) => fetch(input, init),
): BridgeTransport {
  return {
    async send(request) {
      const res = await fetchFn(config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [HARNESS_TOKEN_HEADER]: config.token },
        body: JSON.stringify({ channel: RELAY_CHANNEL, request }),
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`開發用 harness 回應 HTTP ${res.status}`);
      return (await res.json()) as unknown;
    },
  };
}

/** 預設通道：擴充功能頁一律用 chrome.runtime；不是擴充功能頁才看 harness meta；都沒有回 null。 */
export function createDefaultTransport(
  runtime = createRuntimeTransport(),
  harness = readHarnessConfig(),
): BridgeTransport | null {
  if (runtime) return runtime;
  return harness ? createHarnessTransport(harness) : null;
}
