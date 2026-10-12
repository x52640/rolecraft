// 網頁擷取與手動輸入的匯入工作階段內容（D28；resume-import「匯入工作階段」，W4、W14）。
// 網頁來源的原文是區塊清單：helper 依順序配發編號 b1、b2…，不轉成假的頁碼／行號。
// 網址與 nameText 只留在 helper 記憶體（本機遮蔽與預填用，P1-T080），不進 import.get 回應。
import type { ImportManualResult, ImportWebCaptureResult, Platform } from '@rolecraft/contracts';

import type { ResumeCapturePayload } from './service.ts';

/** 只留在 helper 本機的擷取資訊（不回給編輯器、不送模型）。 */
export interface WebCaptureLocal {
  readonly url: string;
  readonly nameText: string | null;
}

const PLATFORM_NAMES: Record<Platform, string> = {
  '104': '104',
  cake: 'Cake',
  yourator: 'Yourator',
  linkedin: 'LinkedIn',
};

/** 擷取內容 → import.get 的網頁來源結果（來源名稱「網頁：<平台>」）。 */
export function webCaptureResult(capture: ResumeCapturePayload): ImportWebCaptureResult {
  return {
    status: 'web_capture',
    displayName: `網頁：${PLATFORM_NAMES[capture.platform]}`,
    platform: capture.platform,
    capturedAt: capture.capturedAt,
    truncated: capture.truncated,
    blocks: capture.blocks.map((block, i) => ({
      id: `b${String(i + 1)}`,
      kind: block.kind,
      level: block.level,
      label: block.label,
      text: block.text,
      continues: block.continues,
    })),
  };
}

export function webCaptureLocal(capture: ResumeCapturePayload): WebCaptureLocal {
  return { url: capture.url, nameText: capture.nameText };
}

/** 手動輸入：沒有原文，使用者直接填表確認（D18）。 */
export const MANUAL_RESULT: ImportManualResult = { status: 'manual', displayName: '手動輸入' };
