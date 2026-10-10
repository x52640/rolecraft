import { EDITOR_PAGE } from '../manifest.ts';
import { findSiteForUrl, siteScriptFile } from '../sites/registry.ts';

/** service worker 用到的 chrome API 子集（測試可注入假物件）。 */
export interface ActionApis {
  getURL(path: string): string;
  createTab(url: string): Promise<unknown>;
  injectScript(tabId: number, file: string): Promise<unknown>;
  showTabNotice(tabId: number, title: string): Promise<unknown>;
}

/** 工具列按鈕：開編輯器分頁（擴充功能頁，ADR-0003）。 */
export async function openEditor(apis: ActionApis): Promise<void> {
  await apis.createTab(apis.getURL(EDITOR_PAGE));
}

export interface TabInfo {
  id?: number | undefined;
  url?: string | undefined;
}

export type CaptureTriggerResult = 'injected' | 'unsupported_page' | 'no_tab';

/**
 * 使用者按擷取快捷鍵：activeTab 只在這時授權目前分頁，才注入該站的 content script。
 * 不是已註冊職缺頁就停下並在按鈕上提示，不注入、不送任何東西。
 */
export async function triggerCapture(
  tab: TabInfo | undefined,
  apis: ActionApis,
): Promise<CaptureTriggerResult> {
  if (tab?.id === undefined) return 'no_tab';
  const site = findSiteForUrl(tab.url);
  if (!site) {
    await apis.showTabNotice(tab.id, '這個頁面不是支援的職缺頁，請改用編輯器手動貼上');
    return 'unsupported_page';
  }
  await apis.injectScript(tab.id, siteScriptFile(site.platform));
  return 'injected';
}
