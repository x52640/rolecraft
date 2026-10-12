// 真實 Chrome 測試用的探針 content script（只打包進測試用的暫存擴充功能，不進正式打包）。
// 跑在擴充功能的隔離環境，和正式履歷頁腳本一樣用 `createChromeOracle(chrome)`（可取得封閉的 shadow root）。
// 頁面把請求寫在 <html data-rolecraft-probe-request>，觸發 `rolecraft-probe` 事件；結果寫回 data 屬性。
import { buildResumeCapture } from '../../resume/capture.ts';
import { createChromeOracle } from '../../resume/chrome-oracle.ts';
import type { UiNoiseRules } from '../../resume/types.ts';

interface ProbeRequest {
  rootSelector: string;
  nameSelector: string | null;
  uiNoise: UiNoiseRules | null;
  pageUrl: string;
  /** false：不給 chrome.dom（只看得到開放的 shadow root），用來確認測試真的走到封閉 shadow root */
  useChromeDom: boolean;
}

const html = document.documentElement;

function run(request: ProbeRequest): unknown {
  const oracle = createChromeOracle(request.useChromeDom ? chrome : undefined);
  return buildResumeCapture(
    {
      platform: '104',
      rootSelector: request.rootSelector,
      nameSelector: request.nameSelector,
      uiNoise: request.uiNoise,
    },
    { doc: document, pageUrl: request.pageUrl, oracle, now: () => new Date(0) },
  );
}

document.addEventListener('rolecraft-probe', () => {
  let result: unknown;
  try {
    result = run(JSON.parse(html.dataset.rolecraftProbeRequest ?? '{}') as ProbeRequest);
  } catch (error) {
    result = { error: String(error) };
  }
  html.dataset.rolecraftProbeResult = JSON.stringify(result);
});
html.dataset.rolecraftProbeReady = '1';
