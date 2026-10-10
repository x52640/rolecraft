import { BridgeRequest } from '@rolecraft/contracts';

import { bridgeFailure, type BridgeClient, type BridgeResponse } from '../bridge/client.ts';
import type { RelayMessage } from './messages.ts';
import { authorizeSender, type SenderInfo } from './sender.ts';

/**
 * service worker 處理頁面轉送：先驗 schema（才知道操作與平台）→ 驗發送者 → 交給橋接客戶端。
 * 被拒的請求不會送到 helper。
 */
export async function handleRelay(
  message: RelayMessage,
  sender: SenderInfo,
  extensionId: string,
  client: BridgeClient,
): Promise<BridgeResponse> {
  const parsed = BridgeRequest.safeParse(message.request);
  if (!parsed.success) return bridgeFailure('invalid_request', '請求不符橋接 schema，未送出');
  const decision = authorizeSender(sender, parsed.data, extensionId);
  if (!decision.allowed) return bridgeFailure('invalid_request', `拒絕轉送：${decision.reason}`);
  return client.send(parsed.data);
}
