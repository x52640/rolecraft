import { z } from 'zod';

/*
 * ID／時間／雜湊格式（P1-T006 定案，ADR-0006 第 1 項）：
 * - RoleCraft 產生的 ID 一律 UUID v4 小寫（CanonicalId）。
 * - RoleCraft 產生的時間一律 UTC、毫秒、Z 結尾（Date#toISOString，CanonicalTimestamp）。
 * - RoleCraft 產生的內容雜湊一律 SHA-256 小寫 hex 64 字（Sha256Hash）。
 * 讀取驗證（Id、Timestamp、ContentHash）刻意較寬：接受任何非空 ID、任何含時區的 ISO 時間，
 * 讓外部輸入（例如擴充功能帶時區的擷取時間）與既有資料仍能通過；產生端用 Canonical*。
 */

/** 物件識別碼（讀取驗證：非空字串）。 */
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** RoleCraft 產生的 ID：UUID v4 小寫。 */
export const CanonicalId = z.uuidv4().regex(/^[0-9a-f-]+$/);

/** ISO 8601 時間（含時區）。 */
export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** RoleCraft 產生的時間：UTC 毫秒精度，例如 2026-10-10T08:00:00.000Z。 */
export const CanonicalTimestamp = z.iso.datetime({ precision: 3 });

/** 內容雜湊（讀取驗證：非空字串）。 */
export const ContentHash = z.string().min(1);
export type ContentHash = z.infer<typeof ContentHash>;

/** RoleCraft 產生的內容雜湊：SHA-256 小寫 hex。 */
export const Sha256Hash = z.string().regex(/^[0-9a-f]{64}$/);

/** 至少一個非空白字元；只有空白（含全形空白）不算內容（codex review P1-T001，R10）。原文不修剪。 */
export const NonEmptyText = z.string().regex(/\S/u, '不可只有空白');

/** 求職平台（jobs-and-messages.md「求職平台」表）。 */
export const Platform = z.enum([
  '104',
  'cake', // Cake（原 CakeResume）
  'yourator',
  'linkedin', // 只走手動貼上（D8）
]);
export type Platform = z.infer<typeof Platform>;

/** 擷取方式（R10）：自動／手動貼上。手動匯入不得標成自動。 */
export const CaptureMethod = z.enum([
  'auto', // 自動
  'manual_paste', // 手動貼上
]);
export type CaptureMethod = z.infer<typeof CaptureMethod>;

/** 官方 AI 服務（D2）。 */
export const Provider = z.enum([
  'claude', // Claude
  'codex', // ChatGPT／Codex
  'antigravity', // Google Antigravity
]);
export type Provider = z.infer<typeof Provider>;

/** 使用者確認紀錄：時間＋確認當下的文字（R1）。 */
export const UserConfirmation = z.strictObject({
  confirmedAt: Timestamp,
  text: NonEmptyText,
});
export type UserConfirmation = z.infer<typeof UserConfirmation>;
