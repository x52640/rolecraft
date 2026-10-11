import type { BridgeFailure } from '@rolecraft/contracts';

/**
 * helper 的資料區被另一個瀏覽器的 helper 占用時回的固定訊息（P1-T052，擁有者裁定 #13；
 * docs/specs/bridge.md 錯誤碼表）。編輯器不 import helper，字串在這裡留一份，逐字比對。
 */
export const HELPER_BUSY_MESSAGE = 'RoleCraft 正在另一個瀏覽器使用中，請先關閉該瀏覽器的 RoleCraft';

/**
 * `helper_unavailable` 給人看的文字：訊息正好是 helper 的占用訊息就照原文顯示，
 * 否則（未安裝、未啟動、連線中斷等）用呼叫端原本的文字。
 */
export function helperUnavailableText(failure: BridgeFailure, fallback: string): string {
  return failure.error.message === HELPER_BUSY_MESSAGE ? HELPER_BUSY_MESSAGE : fallback;
}
