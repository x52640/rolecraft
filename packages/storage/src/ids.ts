import { createHash, randomUUID } from 'node:crypto';

/**
 * 產生端格式（ADR-0006 第 1 項定案，對應 contracts CanonicalId／CanonicalTimestamp／Sha256Hash）。
 */

/** 新 ID：UUID v4 小寫。 */
export function newId(): string {
  return randomUUID();
}

/** 現在時間：UTC、毫秒、Z 結尾。 */
export function nowTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

/** 內容雜湊：SHA-256 小寫 hex。 */
export function sha256Hex(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}
