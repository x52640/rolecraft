// 104 履歷頁 content script 入口（打包成 sites/104-resume.js；web-resume-capture「觸發」）。
// 只在使用者點圖示或按快捷鍵、service worker 依網址注入後跑一次：載入時擷取並送出一次，
// 不掛任何頁面事件，頁面之後的 DOM 變動或事件不會再觸發送出（每注入一次＝一次擷取）。
import { startResumeCapture } from '../../resume/start.ts';
import { resumeConfig104 } from './config.ts';

void startResumeCapture(resumeConfig104());
