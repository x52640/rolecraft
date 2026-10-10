import { z } from 'zod';

import { Id, NonEmptyText, Timestamp } from './common.ts';

/** 投遞起因（F09）。 */
export const ApplicationInitiation = z.enum([
  'proactive', // 主動投遞
  'invited', // 對方邀約
]);
export type ApplicationInitiation = z.infer<typeof ApplicationInitiation>;

/**
 * 投遞紀錄（architecture.md ApplicationRecord、R3）。
 * 實際投出版本只能指向不可變的匯出版本；站內履歷投遞（D20）待驗證後定案。
 */
export const ApplicationRecord = z.strictObject({
  id: Id,
  initiation: ApplicationInitiation,
  appliedAt: Timestamp,
  /** 投遞狀態。狀態值 spec 未定，暫為自由文字。 */
  status: NonEmptyText,
  exportVersionId: Id,
});
export type ApplicationRecord = z.infer<typeof ApplicationRecord>;
