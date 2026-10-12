import type { BridgeFailure, Profile } from '@rolecraft/contracts';

import { helperUnavailableText } from '../../../bridge/helper-busy.ts';

/** 一個可複製的欄位：key 用來在重新讀取後找回同一欄。 */
export interface CopyItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** 一組欄位（個人資料、某段經歷、技能）。 */
export interface CopyGroup {
  readonly key: string;
  readonly title: string;
  readonly items: readonly CopyItem[];
}

/** 技能複製成一段文字時的分隔（使用者貼到網站後可再自行調整）。 */
export const SKILL_SEPARATOR = '、';

/** 任職期間顯示與複製的文字；endDate 為 null 表示至今。 */
export const periodText = (start: string, end: string | null) => `${start} – ${end ?? '至今'}`;

/** 把已確認的 Profile 攤成可複製的欄位（resume-output「內容回填到求職網站」的範圍）。 */
export function profileGroups(profile: Profile): CopyGroup[] {
  const info: CopyItem[] = Object.entries(profile.personalInfo).map(([name, value]) => ({
    key: `info:${name}`,
    label: name,
    value,
  }));
  const groups: CopyGroup[] = [{ key: 'info', title: '個人資料', items: info }];
  profile.experiences.forEach((exp, i) => {
    const n = String(i + 1);
    groups.push({
      key: `exp:${n}`,
      title: `經歷 ${n}`,
      items: [
        { key: `exp:${n}:company`, label: '公司', value: exp.company },
        { key: `exp:${n}:title`, label: '職稱', value: exp.title },
        {
          key: `exp:${n}:period`,
          label: '任職期間',
          value: periodText(exp.startDate, exp.endDate),
        },
        { key: `exp:${n}:description`, label: '描述', value: exp.description },
      ],
    });
  });
  if (profile.skills.length > 0) {
    groups.push({
      key: 'skills',
      title: '技能',
      items: [{ key: 'skills', label: '全部技能', value: profile.skills.join(SKILL_SEPARATOR) }],
    });
  }
  return groups;
}

export function findItem(profile: Profile, key: string): CopyItem | undefined {
  for (const group of profileGroups(profile)) {
    const item = group.items.find((x) => x.key === key);
    if (item) return item;
  }
  return undefined;
}

export const PROFILE_TEXT = {
  none: '還沒有已確認的個人資料：請先到匯入頁匯入並確認。',
  multiple:
    '資料區有多份個人資料（舊資料），無法判定要用哪一份，所以不提供複製。請先整理資料區後再試。',
  notImplemented: '本機輔助程式尚未支援讀取個人資料（服務尚未接上），暫時無法複製。',
  changed: '已確認的個人資料在別處有變更，畫面已更新為最新內容：請確認後再按一次複製。',
  removed: '已確認的個人資料已不在資料區，畫面已更新：沒有複製任何內容。',
  done: (label: string) => `已複製「${label}」。請到求職網站貼上，並由你自己送出。`,
  empty: '這一欄是空的，沒有可複製的內容。',
  clipboard: '無法複製到剪貼簿：請手動選取文字複製。',
} as const;

export const PHOTO_TEXT = {
  none: '還沒有照片。加入後會印進匯出的 PDF；照片不會送給 AI。',
  notImplemented: '本機輔助程式尚未支援照片（服務尚未接上），暫時無法加入、更換或刪除照片。',
  unknown: '無法確認目前的照片狀態，請按「重新讀取照片」。',
  replaceWarning:
    '更換照片等於刪除舊照片：含舊照片、尚未投遞的匯出版本會整份刪除；已投遞的保留並標示。確認後才會開啟選取視窗，在視窗裡取消就不會有任何變動。',
  removeWarning:
    '刪除照片後，含這張照片、尚未投遞的匯出版本會整份刪除；已投遞的保留並標示。這個動作不能復原。',
  appeared: '本機已經有一張照片（可能在別處加入），畫面已更新：要換掉它請按「更換照片」。',
  added: '已加入照片（已去除拍攝位置等中繼資料）。',
  replaced: '已更換照片（已去除拍攝位置等中繼資料）。',
  removed: '已刪除照片。',
  cancelled: '已取消選取，照片沒有變動。',
  pickerBusy: '已經有一個選取視窗開著：請先在那個視窗完成或取消。',
  refreshed: '以下是重新讀取後的實際照片狀態。',
} as const;

/** profile.get／photo.* 失敗給人看的文字（not_implemented 另有明確提示，見呼叫端）。 */
export function failureText(failure: BridgeFailure): string {
  switch (failure.error.code) {
    case 'helper_unavailable':
      return helperUnavailableText(failure, '連不到本機輔助程式：請確認已安裝並啟動。');
    case 'timeout':
      return '本機輔助程式沒有及時回應，請稍後再試。';
    default:
      return failure.error.message;
  }
}
