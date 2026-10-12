// 唯讀 Profile（profile.*）handler 用的服務介面（D28；P1-T079 實作）。
// 方法皆可省略：沒接上的方法，handler 回 not_implemented，不偽造成功。
import type { Profile } from '@rolecraft/contracts';

/** multiple_profiles＝資料區已有多份 Profile（舊資料），不讀也不寫。 */
export type ProfileGetOutcome =
  { ok: true; profile: Profile | null } | { ok: false; reason: 'multiple_profiles' };

export interface ProfileService {
  /** 資料區唯一那份已確認的 Profile；沒有（或未確認）回 null。 */
  get?(): ProfileGetOutcome;
}
