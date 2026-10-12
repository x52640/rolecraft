import { EDITOR_PAGE } from '../manifest.ts';
import { classifyUrl, pageScriptFile, SITE_REGISTRY, type SiteEntry } from '../sites/registry.ts';

/** service worker 用到的 chrome API 子集（測試可注入假物件）。 */
export interface ActionApis {
  getURL(path: string): string;
  createTab(url: string): Promise<unknown>;
  /** 只注入主框架（frameIds: [0]） */
  injectScript(tabId: number, file: string): Promise<unknown>;
  showTabNotice(tabId: number, title: string): Promise<unknown>;
}

export const UNSUPPORTED_PAGE_NOTICE =
  'RoleCraft：這個頁面不是支援的職缺頁或履歷頁，沒有擷取任何內容';
export const INJECT_FAILED_NOTICE =
  'RoleCraft：無法在這個頁面執行擷取（頁面可能還沒載入完，或瀏覽器不允許），沒有擷取任何內容。請重新整理後再試';

/** 開編輯器分頁（擴充功能頁，ADR-0003）；不經 helper。 */
export async function openEditor(apis: ActionApis): Promise<void> {
  await apis.createTab(apis.getURL(EDITOR_PAGE));
}

export interface TabInfo {
  id?: number | undefined;
  url?: string | undefined;
}

export type InjectResult = 'injected' | 'inject_failed';

/** 注入擷取腳本；失敗不開編輯器，只在圖示上提示（徽章＋提示文字）。 */
async function inject(tabId: number, file: string, apis: ActionApis): Promise<InjectResult> {
  try {
    await apis.injectScript(tabId, file);
    return 'injected';
  } catch {
    await apis.showTabNotice(tabId, INJECT_FAILED_NOTICE).catch(() => undefined);
    return 'inject_failed';
  }
}

export type ActionClickResult = InjectResult | 'opened_editor';

/**
 * 點工具列圖示（D9、web-resume-capture「觸發」）：分頁網址符合履歷頁規則 → 只注入履歷頁腳本；
 * 其他（職缺頁、不支援的網站、拿不到分頁或網址）→ 照舊開編輯器、不注入。職缺擷取仍只用快捷鍵。
 */
export async function handleActionClick(
  tab: TabInfo | undefined,
  apis: ActionApis,
  registry: readonly SiteEntry[] = SITE_REGISTRY,
): Promise<ActionClickResult> {
  const match = classifyUrl(tab?.url, registry);
  if (tab?.id === undefined || match?.pageType !== 'resume') {
    await openEditor(apis);
    return 'opened_editor';
  }
  return inject(tab.id, pageScriptFile(match), apis);
}

export type CaptureTriggerResult = InjectResult | 'unsupported_page' | 'no_tab';

/**
 * 擷取快捷鍵：activeTab 只在這時授權目前分頁。依網址注入職缺頁或履歷頁腳本；
 * 都不符就在圖示上提示，不注入、不送任何東西。
 */
export async function triggerCapture(
  tab: TabInfo | undefined,
  apis: ActionApis,
  registry: readonly SiteEntry[] = SITE_REGISTRY,
): Promise<CaptureTriggerResult> {
  if (tab?.id === undefined) return 'no_tab';
  const match = classifyUrl(tab.url, registry);
  if (!match) {
    await apis.showTabNotice(tab.id, UNSUPPORTED_PAGE_NOTICE);
    return 'unsupported_page';
  }
  return inject(tab.id, pageScriptFile(match), apis);
}
