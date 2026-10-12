// 「唯一那份 Profile」的判斷（D28／Q8）：import.confirm 與 profile.get 共用。
// 與履歷生成、自介相同：資料區只有一份才算；多份（舊資料）時不讀也不寫，不代為挑選。
import type { Profile } from '@rolecraft/contracts';

export type UniqueProfile =
  { ok: true; profile: Profile | null } | { ok: false; reason: 'multiple_profiles' };

/** 沒有回 null；只有一份回那一份（不論是否已確認）；多份回 multiple_profiles。 */
export function uniqueProfile(profiles: readonly Profile[]): UniqueProfile {
  if (profiles.length > 1) return { ok: false, reason: 'multiple_profiles' };
  return { ok: true, profile: profiles[0] ?? null };
}
