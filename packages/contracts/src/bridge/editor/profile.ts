import { z } from 'zod';

import { NonEmptyText } from '../../entities/common.ts';
import { Profile, ProfileVersion, WorkExperience } from '../../entities/profile.ts';
import { EmptyPayload, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * profile.*：已確認的 Profile（D28 唯讀，P1-T079；D30 個人資料頁編輯，P1-T090）。
 * profile.get 供複製按鈕重新讀取比對與個人資料頁顯示；profile.update 是個人資料頁按儲存。
 */

/** 已確認的 Profile（R10）：未確認的不回。 */
export const ConfirmedProfile = Profile.refine((p) => p.pdfParseConfirmed, {
  path: ['pdfParseConfirmed'],
  message: '只回已確認的 Profile',
});

/** 來源列：基準版本的哪一列（基本資料用原標籤、經歷與技能用原位置）；null＝新增的列。 */
const FromLabel = z.string().min(1).nullable();
const FromIndex = z.int().min(0).nullable();

/** profile.update 的一列基本資料（含「學歷」列）。 */
export const ProfileUpdateInfoRow = z.strictObject({
  label: z.string().min(1),
  value: z.string(),
  from: FromLabel,
});
export type ProfileUpdateInfoRow = z.infer<typeof ProfileUpdateInfoRow>;

/** profile.update 的一段經歷：欄位同 WorkExperience（驗證同 import.confirm）＋來源列。 */
export const ProfileUpdateExperience = WorkExperience.extend({ from: FromIndex });
export type ProfileUpdateExperience = z.infer<typeof ProfileUpdateExperience>;

/** profile.update 的一項技能。 */
export const ProfileUpdateSkill = z.strictObject({ value: NonEmptyText, from: FromIndex });
export type ProfileUpdateSkill = z.infer<typeof ProfileUpdateSkill>;

/**
 * profile.update 的請求：基準版本號（profile.get 讀到的）＋整份新內容。
 * 不帶出處文字、確認旗標、時間（出處由 helper 依來源列搬移，版本號由 helper 加一）。
 * 基本資料的欄位名不可重複（Profile 以欄位名對應）。
 */
export const ProfileUpdatePayload = z.strictObject({
  baseVersion: ProfileVersion,
  personalInfo: z
    .array(ProfileUpdateInfoRow)
    .refine((rows) => new Set(rows.map((r) => r.label)).size === rows.length, '欄位名稱重複'),
  experiences: z.array(ProfileUpdateExperience),
  skills: z.array(ProfileUpdateSkill),
});
export type ProfileUpdatePayload = z.infer<typeof ProfileUpdatePayload>;

export const PROFILE_SCHEMAS = {
  /**
   * 資料區唯一那份已確認的 Profile；沒有為 null。
   * 已有多份（舊資料）時回 invalid_request＋固定原因 multiple_profiles。
   * D30：Profile 相加版本號與各欄出處（舊資料沒有）。
   */
  'profile.get': {
    request: bridgeOp('profile.get', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), profile: ConfirmedProfile.nullable() }),
    ),
  },
  /**
   * 個人資料頁按儲存（D30；resume-import「個人資料編輯（D30）」）。helper 在同一個寫入比對版本號：
   * 不符回 invalid_request＋profile_conflict、不寫入；沒有 Profile 回 profile_missing；多份回 multiple_profiles；
   * 來源列不存在、同一列引用兩次、內容全空回 invalid_request。成功回寫入後的整份已確認 Profile（含新版本號）。
   */
  'profile.update': {
    request: bridgeOp('profile.update', ProfileUpdatePayload),
    response: withFailure(z.strictObject({ ok: z.literal(true), profile: ConfirmedProfile })),
  },
} as const;
