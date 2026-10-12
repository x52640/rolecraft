/**
 * MV3 manifest（打包時由 scripts/build.mjs 寫成 manifest.json）。
 * 權限最小化：沒有 host_permissions、沒有宣告式 content_scripts、沒有 externally_connectable、
 * 沒有 web_accessible_resources；網頁只在使用者觸發（快捷鍵或點圖示 → activeTab）後才被注入。
 * 不做依頁面變換的圖示或提示文字（要另加權限），所以說明文字一次講清楚兩種行為。
 */
export const BACKGROUND_FILE = 'background.js';
export const EDITOR_PAGE = 'editor/index.html';
export const CAPTURE_COMMAND = 'capture-page';

export const PERMISSIONS = ['activeTab', 'scripting', 'nativeMessaging'] as const;

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  minimum_chrome_version: string;
  permissions: string[];
  background: { service_worker: string; type: 'module' };
  action: { default_title: string };
  commands: Record<string, { description: string; suggested_key?: { default: string } }>;
}

export function buildManifest(version = '0.1.0'): ExtensionManifest {
  return {
    manifest_version: 3,
    name: 'RoleCraft',
    version,
    description:
      '本機 AI 履歷編輯器：在支援的履歷頁點圖示擷取履歷，按快捷鍵擷取職缺頁或履歷頁，交給本機輔助程式；其他頁面點圖示開啟編輯器。',
    // connectNative 讓 service worker 保持存活需要 Chrome 105+（ADR-0003）。
    minimum_chrome_version: '116',
    permissions: [...PERMISSIONS],
    background: { service_worker: BACKGROUND_FILE, type: 'module' },
    action: { default_title: 'RoleCraft：在支援的履歷頁點一下擷取，其他頁面開啟編輯器' },
    commands: {
      [CAPTURE_COMMAND]: {
        description: '擷取目前的職缺頁或履歷頁',
        suggested_key: { default: 'Alt+Shift+J' },
      },
    },
  };
}
