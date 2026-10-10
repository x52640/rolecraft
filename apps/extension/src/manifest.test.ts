import { describe, expect, it } from 'vitest';

import { BACKGROUND_FILE, buildManifest, CAPTURE_COMMAND } from './manifest.ts';
const manifest = buildManifest();
const json = JSON.stringify(manifest);

describe('manifest', () => {
  it('是 MV3，背景是 module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: BACKGROUND_FILE, type: 'module' });
  });

  it('權限只有 activeTab、scripting、nativeMessaging', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'nativeMessaging', 'scripting']);
  });

  it('沒有 host 權限、宣告式 content script、對外連線或可存取資源', () => {
    for (const key of [
      'host_permissions',
      'optional_host_permissions',
      'optional_permissions',
      'content_scripts',
      'externally_connectable',
      'web_accessible_resources',
    ]) {
      expect(manifest).not.toHaveProperty(key);
    }
    expect(json).not.toMatch(/<all_urls>|\*:\/\/|https?:\/\//);
  });

  it('工具列按鈕沒有 popup（點擊交給 service worker 開編輯器）', () => {
    expect(manifest.action).not.toHaveProperty('default_popup');
  });

  it('擷取快捷鍵存在（觸發時才授權 activeTab）', () => {
    expect(manifest.commands[CAPTURE_COMMAND]).toBeDefined();
  });

  it('版本號是 Chrome 接受的 1–4 段整數', () => {
    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/);
  });
});
