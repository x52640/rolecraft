// Profile 欄位值的共用判斷（import.confirm 與 profile.update 共用，驗證相同；D30）。
import type { ProfileContent } from '@rolecraft/contracts';

/** 個人資料、經歷、技能全空：沒有可寫入的內容。 */
export function isEmptyProfileContent(profile: ProfileContent): boolean {
  const hasInfo = Object.values(profile.personalInfo).some((value) => /\S/u.test(value));
  return !hasInfo && profile.experiences.length === 0 && profile.skills.length === 0;
}
