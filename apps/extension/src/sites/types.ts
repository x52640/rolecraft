import type { SubmitJobCaptureRequest } from '@rolecraft/contracts';

import type { SitePlatform } from './registry.ts';

/**
 * 每站的擷取適配器（跑在 content script）。頁面內容只是資料（D6、R7）。
 * capture 回傳 null 表示擷取不到必要欄位：停止並提示改用手動貼上，不送任何東西（R10）。
 */
export interface SiteAdapter {
  platform: SitePlatform;
  capture(doc: Document, pageUrl: string): SubmitJobCaptureRequest | null;
}
