import {
  CONTENT_SCRIPT_OPERATIONS,
  type BridgeRequest,
  type ContentScriptOperation,
} from '@rolecraft/contracts';

import { classifyUrl, SITE_REGISTRY, type PageType, type SiteEntry } from '../sites/registry.ts';

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

/** content script 可發起的操作（清單唯一定義在 contracts）。 */
function isContentScriptRequest(request: BridgeRequest): request is ContentScriptRequest {
  return (CONTENT_SCRIPT_OPERATIONS as readonly string[]).includes(request.op);
}

/** 操作×頁型（W2）：職缺／訊息擷取只在職缺頁，履歷擷取只在履歷頁，兩種規則互不放行。 */
const OPERATION_PAGE_TYPE: Record<ContentScriptOperation, PageType> = {
  submit_job_capture: 'job',
  submit_message_capture: 'job',
  submit_resume_capture: 'resume',
};

/**
 * 只限 content script 的操作（bridge.md「誰可以呼叫」）：履歷擷取只能來自已註冊履歷頁，
 * 編輯器／擴充功能頁送來一律拒絕。
 */
export const CONTENT_SCRIPT_ONLY_OPERATIONS: readonly ContentScriptOperation[] = [
  'submit_resume_capture',
];

/** 發送者是本擴充功能的擴充功能頁（編輯器）。 */
export function isExtensionPage(sender: SenderInfo, extensionId: string): boolean {
  // 不用 URL.origin：非特殊協定的 origin 在部分環境是 "null"，直接比前綴。
  return (
    sender.id === extensionId &&
    !!sender.url &&
    sender.url.startsWith(`chrome-extension://${extensionId}/`)
  );
}

/** 發送頁網址的 origin＋路徑（不含查詢字串與 #）。 */
function originAndPath(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

function checkPayload(request: ContentScriptRequest, senderUrl: string): SenderDecision {
  if (request.op === 'submit_resume_capture') {
    // N4：url 必須等於發送頁的 origin＋路徑。
    if (request.payload.url !== originAndPath(senderUrl)) return deny('網址與發送頁面不符');
    return { allowed: true };
  }
  if (request.payload.captureMethod !== 'auto') return deny('content script 只能送自動擷取');
  return { allowed: true };
}

/**
 * 驗證轉送請求的發送者（ADR-0003）。只回答「是誰在呼叫、能不能呼叫這個操作」，
 * 不代表內容可信（R7）。
 * - 必須是本擴充功能（其他擴充功能、網頁沒有 externally_connectable 本來就送不進來，這裡再擋一次）
 * - 擴充功能頁（origin 相同）：可用全部操作（編輯器頁的檢視、修改、確認、匯出等只限這裡），
 *   但 CONTENT_SCRIPT_ONLY_OPERATIONS（履歷擷取）除外
 * - content script：只能用 CONTENT_SCRIPT_OPERATIONS，且只在主框架、發送頁的頁型要和操作相符
 *   （操作×頁型），平台要和該站一致；職缺／訊息只能送自動擷取，履歷擷取的網址要等於發送頁
 */
export function authorizeSender(
  sender: SenderInfo,
  request: BridgeRequest,
  extensionId: string,
  registry: readonly SiteEntry[] = SITE_REGISTRY,
): SenderDecision {
  if (sender.id !== extensionId) return deny('不是本擴充功能送出的訊息');
  if (!sender.url) return deny('缺少發送者網址');
  if (isExtensionPage(sender, extensionId)) {
    if ((CONTENT_SCRIPT_ONLY_OPERATIONS as readonly string[]).includes(request.op)) {
      return deny(`擴充功能頁不能呼叫 ${request.op}`);
    }
    return { allowed: true };
  }

  if (sender.frameId !== 0) return deny('只接受主框架的 content script');
  // content script 只能送擷取結果；其餘操作（草稿、確認、匯出、選檔等）只能由擴充功能頁發起。
  if (!isContentScriptRequest(request)) return deny(`content script 不能呼叫 ${request.op}`);
  const match = classifyUrl(sender.url, registry);
  if (!match) return deny('發送頁面不是已註冊的職缺頁或履歷頁');
  if (match.pageType !== OPERATION_PAGE_TYPE[request.op]) return deny('操作與發送頁面的頁型不符');
  if (request.payload.platform !== match.site.platform) return deny('平台與發送頁面不符');
  return checkPayload(request, sender.url);
}
