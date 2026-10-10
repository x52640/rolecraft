import { z } from 'zod';

import { Id, NonEmptyText } from './common.ts';

/**
 * 一段工作經歷。公司、職稱、任職日期由這裡帶入模板，不交給模型生成（R1）。
 * 日期格式 spec 未定，暫為字串。
 */
export const WorkExperience = z.strictObject({
  company: NonEmptyText,
  title: NonEmptyText,
  startDate: NonEmptyText,
  /** null 表示至今 */
  endDate: NonEmptyText.nullable(),
  description: z.string(),
});
export type WorkExperience = z.infer<typeof WorkExperience>;

/** 個人資料（architecture.md Profile、R10）。 */
export const Profile = z.strictObject({
  id: Id,
  /** 個人資料欄位。欄位清單 spec 未定，暫為「欄位名 → 值」。 */
  personalInfo: z.record(z.string().min(1), z.string()),
  /** 完整經歷 */
  experiences: z.array(WorkExperience),
  skills: z.array(NonEmptyText),
  /** PDF 解析結果是否已經使用者確認；確認後才能用於生成（R10） */
  pdfParseConfirmed: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;
