import {
  CONTENT_SCRIPT_OPERATIONS,
  type BridgeRequest,
  type ContentScriptOperation,
} from '@rolecraft/contracts';

import { findSiteForUrl } from '../sites/registry.ts';

/** chrome.runtime.MessageSender 中用到的部分。 */
export interface SenderInfo {
  id?: string | undefined;
  url?: string | undefined;
  frameId?: number | undefined;
  tab?: { url?: string | undefined } | undefined;
}

export type SenderDecision = { allowed: true } | { allowed: false; reason: string };

const deny = (reason: string): SenderDecision => ({ allowed: false, reason });

type ContentScriptRequest = Extract<BridgeRequest, { op: ContentScriptOperation }>;

/** 只有職缺／訊息擷取可由 content script 發起（清單唯一定義在 contracts）。 */
function isContentScriptRequest(request: BridgeRequest): request is ContentScriptRequest {
  return (CONTENT_SCRIPT_OPERATIONS as readonly string[]).includes(request.op);
}

/**
 * 驗證轉送請求的發送者（ADR-0003）。只回答「是誰在呼叫、能不能呼叫這個操作」，
 * 不代表內容可信（R7）。
 * - 必須是本擴充功能（其他擴充功能、網頁沒有 externally_connectable 本來就送不進來，這裡再擋一次）
 * - 擴充功能頁（origin 相同）：可用全部操作（編輯器頁的檢視、修改、確認、匯出等只限這裡）
 * - content script：只能用 CONTENT_SCRIPT_OPERATIONS（職缺／訊息擷取），且只在主框架、
 *   網址是已註冊職缺頁、只能送自動擷取，平台要和該站一致
 */
export function authorizeSender(
  sender: SenderInfo,
  request: BridgeRequest,
  extensionId: string,
): SenderDecision {
  if (sender.id !== extensionId) return deny('不是本擴充功能送出的訊息');
  if (!sender.url) return deny('缺少發送者網址');
  // 不用 URL.origin：非特殊協定的 origin 在部分環境是 "null"，直接比前綴。
  if (sender.url.startsWith(`chrome-extension://${extensionId}/`)) return { allowed: true };

  if (sender.frameId !== 0) return deny('只接受主框架的 content script');
  // content script 只能送擷取結果；其餘操作（草稿、確認、匯出、選檔等）只能由擴充功能頁發起。
  if (!isContentScriptRequest(request)) return deny(`content script 不能呼叫 ${request.op}`);
  const site = findSiteForUrl(sender.url);
  if (!site) return deny('發送頁面不是已註冊的職缺頁');
  if (request.payload.platform !== site.platform) return deny('平台與發送頁面不符');
  if (request.payload.captureMethod !== 'auto') return deny('content script 只能送自動擷取');
  return { allowed: true };
}
