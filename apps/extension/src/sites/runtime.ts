import { relayMessage } from '../relay/messages.ts';
import type { SiteAdapter } from './types.ts';

export type SiteRunResult =
  | { status: 'not_captured'; platform: string }
  | { status: 'sent'; platform: string; response: unknown };

/**
 * content script 共用流程：適配器擷取 → 經 service worker 轉送。
 * content script 不連 Native Messaging，也不自己驗回應；service worker 會驗 schema 與發送者。
 */
export async function runSiteCapture(
  adapter: SiteAdapter,
  doc: Document,
  pageUrl: string,
  sendToWorker: (message: unknown) => Promise<unknown>,
): Promise<SiteRunResult> {
  const request = adapter.capture(doc, pageUrl);
  if (!request) return { status: 'not_captured', platform: adapter.platform };
  const response = await sendToWorker(relayMessage(request));
  return { status: 'sent', platform: adapter.platform, response };
}
