import type { SiteAdapter } from '../types.ts';

/**
 * 104 適配器：佔位。擷取邏輯要等逐站驗證與 DOM 樣本後的 Task 實作（D16、R10）；
 * 在那之前一律回 null，不產生任何「自動擷取」資料。
 */
export const adapter104: SiteAdapter = {
  platform: '104',
  capture: () => null,
};
