import { BridgeRequest } from '@rolecraft/contracts';

import { bridgeFailure, type BridgeClient, type BridgeResponse } from '../bridge/client.ts';
import type { SiteEntry } from '../sites/registry.ts';
import type { RelayMessage } from './messages.ts';
import { authorizeSender, type SenderInfo } from './sender.ts';

export interface RelayOptions {
  /** 測試注入的假 registry；省略用正式的 SITE_REGISTRY */
  registry?: readonly SiteEntry[] | undefined;
  /**
   * content script 的履歷擷取經 helper 回成功（含截斷）後呼叫：service worker 開一個編輯器分頁
   * （web-resume-capture「擷取結果」）。失敗不呼叫。
   */
  onResumeCaptured?: (() => Promise<unknown>) | undefined;
}

/**
 * service worker 處理頁面轉送：先驗 schema（才知道操作與平台）→ 驗發送者 → 交給橋接客戶端。
 * 被拒的請求不會送到 helper。
 */
export async function handleRelay(
  message: RelayMessage,
  sender: SenderInfo,
  extensionId: string,
  client: BridgeClient,
  options: RelayOptions = {},
): Promise<BridgeResponse> {
  const parsed = BridgeRequest.safeParse(message.request);
  if (!parsed.success) return bridgeFailure('invalid_request', '請求不符橋接 schema，未送出');
  const decision = authorizeSender(sender, parsed.data, extensionId, options.registry);
  if (!decision.allowed) return bridgeFailure('invalid_request', `拒絕轉送：${decision.reason}`);
  const response = await client.send(parsed.data);
  // 履歷擷取只會來自 content script（authorizeSender 擋掉擴充功能頁）。
  if (parsed.data.op === 'submit_resume_capture' && response.ok && options.onResumeCaptured) {
    // 開編輯器失敗不影響回給 content script 的結果（helper 已經收下擷取）。
    await options.onResumeCaptured().catch(() => undefined);
  }
  return response;
}
