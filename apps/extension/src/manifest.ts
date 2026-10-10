/**
 * MV3 manifest（打包時由 scripts/build.mjs 寫成 manifest.json）。
 * 權限最小化：沒有 host_permissions、沒有宣告式 content_scripts、沒有 externally_connectable、
 * 沒有 web_accessible_resources；網頁只在使用者觸發（快捷鍵 → activeTab）後才被注入。
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
    description: '本機 AI 履歷編輯器：在你按下快捷鍵時讀取目前的職缺頁，交給本機輔助程式。',
    // connectNative 讓 service worker 保持存活需要 Chrome 105+（ADR-0003）。
    minimum_chrome_version: '116',
    permissions: [...PERMISSIONS],
    background: { service_worker: BACKGROUND_FILE, type: 'module' },
    action: { default_title: '開啟 RoleCraft 編輯器' },
    commands: {
      [CAPTURE_COMMAND]: {
        description: '擷取目前的職缺頁',
        suggested_key: { default: 'Alt+Shift+J' },
      },
    },
  };
}
