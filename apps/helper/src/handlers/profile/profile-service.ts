// 唯讀 Profile 服務（D28，P1-T079）：profile.get 回資料區唯一那份已確認的 Profile。
import type { Profile } from '@rolecraft/contracts';

import type { ProfileGetOutcome, ProfileService } from './service.ts';
import { uniqueProfile } from './unique.ts';

/** 只需要 Profile repository 的讀取。 */
export interface ProfileSource {
  list(): Profile[];
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
  };
}
