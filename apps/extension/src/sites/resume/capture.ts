import {
  RESUME_CAPTURE_NAME_TEXT_MAX_CHARS,
  SubmitResumeCaptureRequest,
  SubmitResumeCaptureResponse,
} from '@rolecraft/contracts';

import { relayMessage } from '../../relay/messages.ts';
import { flatText } from './dom.ts';
import { extractBlocks } from './extract.ts';
import { applyLimits } from './limits.ts';
import { filterNoiseBlocks, noiseElementMatcher } from './noise.ts';
import { RESUME_FAILED_MESSAGE, RESUME_NOT_FOUND_MESSAGE } from './notice.ts';
import { isReadableChain, scopedOracle } from './render.ts';
import { joinLines } from './text.ts';
import type { RenderOracle, ResumeSiteConfig } from './types.ts';

/**
 * 履歷頁擷取的共用流程（content script 端）：找根節點 → 抽區塊、套上限 → 組
 * `submit_resume_capture` → 經 service worker 轉送。頁面內容只是資料（R7）。
 * 只在使用者觸發、腳本被注入後才跑；找不到根節點或沒有內容就什麼都不送（N3）。
 */

export type ResumeCaptureOutcome =
  | { status: 'not_found' }
  | { status: 'invalid' }
  | { status: 'error' }
  | { status: 'sent'; response: unknown };

export interface ResumeCaptureDeps {
  doc: Document;
  pageUrl: string;
  oracle: RenderOracle;
  now: () => Date;
  sendToWorker: (message: unknown) => Promise<unknown>;
}

function query(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

/** 姓名元素的文字（可以在根節點外）；沒登記、找不到、不可見、空白或過長都回 null。 */
function readNameText(config: ResumeSiteConfig, doc: Document, oracle: RenderOracle) {
  if (!config.nameSelector) return null;
  const el = query(doc, config.nameSelector);
  if (!el || !isReadableChain(el, oracle, null)) return null;
  const text = joinLines(flatText(el, oracle));
  return text !== '' && text.length <= RESUME_CAPTURE_NAME_TEXT_MAX_CHARS ? text : null;
}

/** 只取 origin＋路徑（不存查詢字串與 #；N4）。 */
function originAndPath(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

/**
 * 組請求：找不到根節點（或根節點沒有可讀內容）回 not_found；不符 schema 回 invalid。
 * 介面字樣過濾在上限之前（介面字樣不佔上限）；姓名元素不套過濾。
 */
export function buildResumeCapture(
  config: ResumeSiteConfig,
  deps: Pick<ResumeCaptureDeps, 'doc' | 'pageUrl' | 'oracle' | 'now'>,
): SubmitResumeCaptureRequest | 'not_found' | 'invalid' {
  const { doc } = deps;
  const oracle = scopedOracle(deps.oracle);
  const root = query(doc, config.rootSelector);
  if (!root || !isReadableChain(root, oracle, null)) return 'not_found';
  const extracted = filterNoiseBlocks(
    extractBlocks(root, oracle, noiseElementMatcher(config.uiNoise)),
    config.uiNoise,
  );
  if (extracted.length === 0) return 'not_found';
  const { blocks, truncated } = applyLimits(extracted);
  const parsed = SubmitResumeCaptureRequest.safeParse({
    op: 'submit_resume_capture',
    payload: {
      platform: config.platform,
      url: originAndPath(deps.pageUrl),
      capturedAt: deps.now().toISOString(),
      truncated,
      nameText: readNameText(config, doc, oracle),
      blocks,
    },
  });
  return parsed.success ? parsed.data : 'invalid';
}

/** 擷取並送出；送出前先用 contracts schema 驗，不符就不送；任何例外都當失敗。 */
export async function runResumeCapture(
  config: ResumeSiteConfig,
  deps: ResumeCaptureDeps,
): Promise<ResumeCaptureOutcome> {
  try {
    const request = buildResumeCapture(config, deps);
    if (request === 'not_found' || request === 'invalid') return { status: request };
    return { status: 'sent', response: await deps.sendToWorker(relayMessage(request)) };
  } catch {
    return { status: 'error' };
  }
}

/** 要在頁面提示的文字；只有 helper 回 `{ ok: true }` 才算成功、不提示。 */
export function resumeNoticeText(outcome: ResumeCaptureOutcome): string | null {
  if (outcome.status === 'not_found') return RESUME_NOT_FOUND_MESSAGE;
  if (outcome.status !== 'sent') return RESUME_FAILED_MESSAGE;
  const parsed = SubmitResumeCaptureResponse.safeParse(outcome.response);
  return parsed.success && parsed.data.ok ? null : RESUME_FAILED_MESSAGE;
}
