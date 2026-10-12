// Profile（profile.*）handler 用的服務介面（D28 唯讀，P1-T079；D30 個人資料頁編輯，P1-T090）。
// 方法皆可省略：沒接上的方法，handler 回 not_implemented，不偽造成功。
import type { Profile, ProfileUpdatePayload } from '@rolecraft/contracts';

/** multiple_profiles＝資料區已有多份 Profile（舊資料），不讀也不寫。 */
export type ProfileGetOutcome =
  { ok: true; profile: Profile | null } | { ok: false; reason: 'multiple_profiles' };

/**
 * profile.update 不寫入的原因（都不動資料）：
 * - profile_conflict：基準版本號不是目前版本（D30）
 * - profile_missing：資料區沒有（已確認的）Profile
 * - multiple_profiles：資料區已有多份 Profile（舊資料）
 * - bad_source_row：來源列不存在，或同一列被引用兩次
 * - empty_profile：個人資料、經歷、技能全空（驗證同 import.confirm）
 */
export type ProfileUpdateRefusal =
  'profile_conflict' | 'profile_missing' | 'multiple_profiles' | 'bad_source_row' | 'empty_profile';

export type ProfileUpdateOutcome =
  { ok: true; profile: Profile } | { ok: false; reason: ProfileUpdateRefusal };

export interface ProfileService {
  /** 資料區唯一那份已確認的 Profile；沒有（或未確認）回 null。 */
  get?(): ProfileGetOutcome;
  /** 個人資料頁儲存（D30）：比對版本號、搬移出處、版本號加一，在同一段同步程式內完成。 */
  update?(request: ProfileUpdatePayload): ProfileUpdateOutcome;
}
