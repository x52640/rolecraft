import type { Platform } from '@rolecraft/contracts';

/**
 * 逐站 content script 註冊表（中繼資料，不含擷取邏輯）。
 * 每站一個資料夾 `src/sites/<platform>/`：職缺頁入口 `content.ts` 打包成 `sites/<platform>.js`；
 * 有登記履歷頁的站另有 `resume/content.ts`，打包成 `sites/<platform>-resume.js`（web-resume-capture）。
 * content script 不寫進 manifest，只在使用者觸發時用 scripting.executeScript 注入（activeTab）。
 * LinkedIn 只走手動貼上（D8），型別上就排除。
 */
export type SitePlatform = Exclude<Platform, 'linkedin'>;

/** 履歷頁登記（D28）：網址規則要窄到只符合要讀的那一種頁。 */
export interface ResumePageRule {
  /** 允許的主機名（完全相符，只認 https、預設埠） */
  hosts: readonly string[];
  /** 允許的路徑（完全相符；查詢字串與 # 不看） */
  paths: readonly string[];
  /** 履歷本文根節點的選擇器（P1-T075 的共用流程用） */
  rootSelector: string;
  /** 選填：姓名元素的選擇器（可以在根節點外） */
  nameSelector: string | null;
}

export interface SiteEntry {
  platform: SitePlatform;
  /** 職缺頁允許的主機名（完全相符，只認 https、預設埠） */
  hosts: readonly string[];
  /** 職缺頁路徑前綴 */
  jobPathPrefixes: readonly string[];
  /** 履歷頁規則；沒登記的站點圖示一律開編輯器 */
  resumePage?: ResumePageRule | undefined;
}

export const SITE_REGISTRY: readonly SiteEntry[] = [
  // 104：職缺擷取是佔位（P1-T018）；履歷頁規則由 P1-T077 加。
  { platform: '104', hosts: ['www.104.com.tw'], jobPathPrefixes: ['/job/'] },
];

export type PageType = 'job' | 'resume';

export interface PageMatch {
  site: SiteEntry;
  pageType: PageType;
}

/** 打包後的職缺頁 content script 檔名（相對擴充功能根目錄）。 */
export function siteScriptFile(platform: SitePlatform): string {
  return `sites/${platform}.js`;
}

/** 打包用的職缺頁 content script 原始碼入口（相對 apps/extension）。 */
export function siteSourceEntry(platform: SitePlatform): string {
  return `src/sites/${platform}/content.ts`;
}

/** 打包後的履歷頁 content script 檔名（與職缺頁分開兩支）。 */
export function siteResumeScriptFile(platform: SitePlatform): string {
  return `sites/${platform}-resume.js`;
}

/** 打包用的履歷頁 content script 原始碼入口（相對 apps/extension）。 */
export function siteResumeSourceEntry(platform: SitePlatform): string {
  return `src/sites/${platform}/resume/content.ts`;
}

/** 依頁型選要注入的腳本。 */
export function pageScriptFile(match: PageMatch): string {
  return match.pageType === 'resume'
    ? siteResumeScriptFile(match.site.platform)
    : siteScriptFile(match.site.platform);
}

export interface SiteBundle {
  name: string;
  entry: string;
  file: string;
}

/** 打包清單：每站職缺頁一支，有登記履歷頁的站另一支。 */
export function siteBundles(registry: readonly SiteEntry[] = SITE_REGISTRY): SiteBundle[] {
  return registry.flatMap((site) => {
    const job = {
      name: `rolecraftSite${site.platform}`,
      entry: siteSourceEntry(site.platform),
      file: siteScriptFile(site.platform),
    };
    if (!site.resumePage) return [job];
    const resume = {
      name: `rolecraftResume${site.platform}`,
      entry: siteResumeSourceEntry(site.platform),
      file: siteResumeScriptFile(site.platform),
    };
    return [job, resume];
  });
}

/** 只收 https、預設埠的網址；其他回 null。 */
function parseHttpsUrl(rawUrl: string | undefined): URL | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port !== '') return null;
  return url;
}

function isJobUrl(site: SiteEntry, url: URL): boolean {
  return (
    site.hosts.includes(url.hostname) &&
    site.jobPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))
  );
}

function isResumeUrl(site: SiteEntry, url: URL): boolean {
  const rule = site.resumePage;
  return !!rule && rule.hosts.includes(url.hostname) && rule.paths.includes(url.pathname);
}

/**
 * 網址屬於哪一站、哪一種頁（職缺頁／履歷頁）；都不是回 null。
 * 任何網址最多屬於一種頁型：同時符合兩種規則（registry 設錯）也回 null，不注入、不放行。
 */
export function classifyUrl(
  rawUrl: string | undefined,
  registry: readonly SiteEntry[] = SITE_REGISTRY,
): PageMatch | null {
  const url = parseHttpsUrl(rawUrl);
  if (!url) return null;
  const matches: PageMatch[] = [];
  for (const site of registry) {
    if (isJobUrl(site, url)) matches.push({ site, pageType: 'job' });
    if (isResumeUrl(site, url)) matches.push({ site, pageType: 'resume' });
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/** 找出網址對應的已註冊職缺頁站；不是職缺頁回 null。 */
export function findSiteForUrl(
  rawUrl: string | undefined,
  registry: readonly SiteEntry[] = SITE_REGISTRY,
): SiteEntry | null {
  const match = classifyUrl(rawUrl, registry);
  return match?.pageType === 'job' ? match.site : null;
}

/**
 * 同一站的職缺頁規則與履歷頁規則是否重疊（registry 測試擋）：
 * 履歷頁某個主機也是職缺頁主機，且某個履歷頁路徑落在職缺頁路徑前綴下。
 */
export function rulesOverlap(site: SiteEntry): boolean {
  const rule = site.resumePage;
  if (!rule) return false;
  const sharedHost = rule.hosts.some((host) => site.hosts.includes(host));
  return (
    sharedHost &&
    rule.paths.some((path) => site.jobPathPrefixes.some((prefix) => path.startsWith(prefix)))
  );
}

/** 姓名元素選擇器等站設定（給履歷頁 content script 讀）。 */
export function resumePageRule(platform: SitePlatform): ResumePageRule | null {
  return SITE_REGISTRY.find((site) => site.platform === platform)?.resumePage ?? null;
}
