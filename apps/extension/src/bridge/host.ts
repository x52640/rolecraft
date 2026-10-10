/**
 * Native Messaging host 名稱（ADR-0003）：唯一定義在 contracts，helper 的 host manifest 用同一個名稱註冊，
 * 且 allowed_origins 只列本擴充功能。
 */
export { NATIVE_HOST_NAME } from '@rolecraft/contracts';

/** 單次往返逾時（毫秒）。長工作由 helper 回工作 id，不在這裡等。 */
export const DEFAULT_TIMEOUT_MS = 30_000;
