// 呼叫者來源驗證（ADR-0003、R7）：瀏覽器把呼叫者 origin 當第一個參數傳給 host。
// host manifest 的 allowed_origins 已先擋一次；host 再依自己的允許清單逐字比對一次。
// 來源驗證只回答「是誰在呼叫」，不代表請求內容可信。

/** Native Messaging host 名稱；唯一定義在 contracts，與擴充功能端共用。 */
export { NATIVE_HOST_NAME } from '@rolecraft/contracts';

/** 擴充功能 origin 格式：chrome-extension://<32 個 a–p 字元>/ 。 */
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}\/$/;

/** 安裝程式寫入 host 包裝檔的環境變數：逗號分隔的允許 origin。 */
export const ALLOWED_ORIGINS_ENV = 'ROLECRAFT_ALLOWED_ORIGINS';

export function isExtensionOrigin(value: unknown): value is string {
  return typeof value === 'string' && EXTENSION_ORIGIN.test(value);
}

/**
 * 解析允許清單。格式不符的項目整份拒絕（fail closed），避免打錯字變成放行。
 * 沒設定時回空清單，等於拒絕所有呼叫者。
 */
export function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return [];
  const items = raw.split(',').map((item) => item.trim());
  if (!items.every(isExtensionOrigin)) {
    throw new Error(`${ALLOWED_ORIGINS_ENV} 含格式不符的 origin`);
  }
  return items;
}

/** 呼叫者 origin 必須格式正確且逐字落在允許清單內。 */
export function isAllowedOrigin(origin: unknown, allowed: readonly string[]): boolean {
  return isExtensionOrigin(origin) && allowed.includes(origin);
}
