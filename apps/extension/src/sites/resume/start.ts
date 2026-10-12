import { resumeNoticeText, runResumeCapture } from './capture.ts';
import { createChromeOracle } from './chrome-oracle.ts';
import { showResumeNotice } from './notice.ts';
import type { ResumeSiteConfig } from './types.ts';

/**
 * 各站履歷頁擷取腳本的入口（各站 `sites/<platform>-resume` 腳本只需帶自己的設定呼叫；P1-T077）。
 * 只在使用者點圖示或按快捷鍵、service worker 注入後才跑（P1-T076）；失敗只在頁面提示，不開編輯器。
 */
export async function startResumeCapture(config: ResumeSiteConfig): Promise<void> {
  const outcome = await runResumeCapture(config, {
    doc: document,
    pageUrl: location.href,
    oracle: createChromeOracle(chrome),
    now: () => new Date(),
    sendToWorker: (message) => chrome.runtime.sendMessage(message),
  });
  const text = resumeNoticeText(outcome);
  if (text !== null) showResumeNotice(document, text);
}
