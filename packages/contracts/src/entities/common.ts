import { z } from 'zod';

/** 物件識別碼。格式 spec 未定，只要求非空字串。 */
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** ISO 8601 時間（含時區）。 */
export const Timestamp = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

/** 內容雜湊。演算法 spec 未定，只要求非空字串。 */
export const ContentHash = z.string().min(1);
export type ContentHash = z.infer<typeof ContentHash>;

export const NonEmptyText = z.string().min(1);

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
