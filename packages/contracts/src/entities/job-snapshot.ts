import { z } from 'zod';

import { CaptureMethod, Id, NonEmptyText, Platform, Timestamp } from './common.ts';

/**
 * 選用欄位的擷取結果（R10）。
 * - captured：有擷取到內容
 * - not_captured：未擷取到（找不到頁面結構）
 * - not_provided：頁面未提供（結構存在但內容空白）
 */
export const OptionalFieldResult = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('captured'), value: NonEmptyText }),
  z.strictObject({ status: z.literal('not_captured') }),
  z.strictObject({ status: z.literal('not_provided') }),
]);
export type OptionalFieldResult = z.infer<typeof OptionalFieldResult>;

/**
 * 職缺欄位（F06）。必要欄位：公司、職稱、職缺描述本文（R10），缺一即擷取失敗、不建快照；
 * 其餘為選用欄位，記錄擷取結果。
 */
export const JobFields = z.strictObject({
  company: NonEmptyText,
  title: NonEmptyText,
  description: NonEmptyText,
  responsibilities: OptionalFieldResult, // 職責
  requirements: OptionalFieldResult, // 必要條件
  preferredQualifications: OptionalFieldResult, // 加分條件
  location: OptionalFieldResult, // 地點
});
export type JobFields = z.infer<typeof JobFields>;

/** LinkedIn 只走手動貼上（D8）：平台為 linkedin 時不得標成自動擷取。 */
export const linkedInManualOnly = {
  check: (v: { platform: Platform; captureMethod: CaptureMethod }): boolean =>
    !(v.platform === 'linkedin' && v.captureMethod === 'auto'),
  params: { path: ['captureMethod'], message: 'LinkedIn 只能手動貼上（D8）' },
};

/** 職缺快照（architecture.md JobSnapshot、F06、R10）。 */
export const JobSnapshot = z
  .strictObject({
    id: Id,
    platform: Platform,
    /** 來源 URL；手動貼上時可能沒有 */
    url: z.url().nullable(),
    capturedAt: Timestamp,
    captureMethod: CaptureMethod,
    fields: JobFields,
    /** 使用者是否改過 */
    userModified: z.boolean(),
    /** 使用者確認快照的時間；確認後才能用於生成（R10） */
    confirmedAt: Timestamp.nullable(),
  })
  .refine(linkedInManualOnly.check, linkedInManualOnly.params);
export type JobSnapshot = z.infer<typeof JobSnapshot>;
