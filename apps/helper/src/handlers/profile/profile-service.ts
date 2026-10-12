// Profile 服務（D28，P1-T079；D30，P1-T090）：profile.get 回資料區唯一那份已確認的 Profile；
// profile.update 是個人資料頁的儲存。
import type { Profile } from '@rolecraft/contracts';

import type { ProfileGetOutcome, ProfileService, ProfileUpdateOutcome } from './service.ts';
import { uniqueProfile } from './unique.ts';
import { applyProfileUpdate } from './update-apply.ts';

/** Profile repository 的讀寫（node:sqlite 是同步的：讀、比對、寫在同一段同步程式內）。 */
export interface ProfileSource {
  list(): Profile[];
  save(profile: Profile): Profile;
}

export function createProfileService(profiles: ProfileSource): ProfileService {
  return {
    get(): ProfileGetOutcome {
      const unique = uniqueProfile(profiles.list());
      if (!unique.ok) return unique;
      // 未確認的不回（R10）：只有一份但未確認時當成沒有
      const profile = unique.profile?.pdfParseConfirmed ? unique.profile : null;
      return { ok: true, profile };
    },

    update(request): ProfileUpdateOutcome {
      // 版本比對與寫入在同一段同步程式內（中間沒有 await）：別處的寫入插不進來（D30 並行）。
      const unique = uniqueProfile(profiles.list());
      if (!unique.ok) return unique;
      // 未確認的當成沒有（同 profile.get）：個人資料頁只編輯已確認的 Profile
      if (!unique.profile?.pdfParseConfirmed) return { ok: false, reason: 'profile_missing' };
      const applied = applyProfileUpdate(unique.profile, request);
      if (!applied.ok) return applied;
      return { ok: true, profile: profiles.save(applied.profile) };
    },
  };
}
