import type { Platform } from '@rolecraft/contracts';

/**
 * 逐站 content script 註冊表（中繼資料，不含擷取邏輯）。
 * 每站一個資料夾 `src/sites/<platform>/`，入口固定為 `content.ts`，打包成 `sites/<platform>.js`。
 * content script 不寫進 manifest，只在使用者觸發時用 scripting.executeScript 注入（activeTab）。
 * LinkedIn 只走手動貼上（D8），型別上就排除。
 */
export type SitePlatform = Exclude<Platform, 'linkedin'>;

export interface SiteEntry {
  platform: SitePlatform;
  /** 允許的主機名（完全相符，只認 https） */
  hosts: readonly string[];
  /** 職缺頁路徑前綴 */
  jobPathPrefixes: readonly string[];
}

export const SITE_REGISTRY: readonly SiteEntry[] = [
  // 104：佔位，擷取邏輯在後續 Task。
  { platform: '104', hosts: ['www.104.com.tw'], jobPathPrefixes: ['/job/'] },
];

/** 打包後的 content script 檔名（相對擴充功能根目錄）。 */
export function siteScriptFile(platform: SitePlatform): string {
  return `sites/${platform}.js`;
}

/** 打包用的 content script 原始碼入口（相對 apps/extension）。 */
export function siteSourceEntry(platform: SitePlatform): string {
  return `src/sites/${platform}/content.ts`;
}

/** 找出網址對應的已註冊站；不是 https、主機或路徑不符都回傳 null。 */
export function findSiteForUrl(rawUrl: string | undefined): SiteEntry | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  return (
    SITE_REGISTRY.find(
      (site) =>
        site.hosts.includes(url.hostname) &&
        site.jobPathPrefixes.some((prefix) => url.pathname.startsWith(prefix)),
    ) ?? null
  );
}
