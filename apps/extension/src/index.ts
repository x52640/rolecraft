/** extension 的公開入口（給打包腳本與測試用；擴充功能本身的入口見 background/、sites/；編輯器頁在 apps/editor）。 */
export const PACKAGE_NAME = '@rolecraft/extension';

export { buildManifest, EDITOR_PAGE, BACKGROUND_FILE, CAPTURE_COMMAND } from './manifest.ts';
export type { ExtensionManifest } from './manifest.ts';
export {
  SITE_REGISTRY,
  findSiteForUrl,
  siteScriptFile,
  siteSourceEntry,
} from './sites/registry.ts';
export type { SiteEntry, SitePlatform } from './sites/registry.ts';
export { NATIVE_HOST_NAME } from './bridge/host.ts';
export { RELAY_CHANNEL } from './relay/messages.ts';
