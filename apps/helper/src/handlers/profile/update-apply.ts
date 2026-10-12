// profile.update 的純邏輯（D30，resume-import「個人資料編輯（D30）」）：比對版本號 → 依來源列搬移出處並判定
// 「已修改」→ 驗證（同 import.confirm）→ 組出新的 Profile（版本號加一）。不做 I/O；寫入由呼叫端在同一段同步程式內做。
// 出處只從基準 Profile 搬移，請求裡沒有也不能帶出處文字。
import {
  profileVersionOf,
  type Profile,
  type ProfileExperienceSources,
  type ProfileFieldSource,
  type ProfileSources,
  type ProfileUpdatePayload,
  type WorkExperience,
} from '@rolecraft/contracts';

import { isEmptyProfileContent } from './content.ts';
import type { ProfileUpdateRefusal } from './service.ts';

type Applied = { ok: true; profile: Profile } | { ok: false; reason: ProfileUpdateRefusal };

const EXPERIENCE_KEYS = ['company', 'title', 'startDate', 'endDate', 'description'] as const;

const NO_EXPERIENCE_SOURCES: ProfileExperienceSources = {
  company: null,
  title: null,
  startDate: null,
  endDate: null,
  description: null,
};

/** 搬移一欄出處：值與基準不同就標「已修改」；一旦標過就保留（顯示的仍是原本的出處）。 */
function moved(source: ProfileFieldSource | null | undefined, changed: boolean) {
  if (!source) return null;
  return { ...source, modified: source.modified || changed };
}

/** 來源列檢查：不存在或同一列被引用兩次都不行。 */
function claim<K>(used: Set<K>, from: K, exists: boolean): boolean {
  if (!exists || used.has(from)) return false;
  used.add(from);
  return true;
}

/** 基本資料列：以原標籤對來源列。 */
function infoOf(base: Profile, request: ProfileUpdatePayload, sources: ProfileSources | undefined) {
  const used = new Set<string>();
  const values: [string, string][] = [];
  const moves: [string, ProfileFieldSource][] = [];
  for (const row of request.personalInfo) {
    if (values.some(([label]) => label === row.label)) return null;
    values.push([row.label, row.value]);
    if (row.from === null) continue;
    if (!claim(used, row.from, Object.hasOwn(base.personalInfo, row.from))) return null;
    const old =
      sources && Object.hasOwn(sources.personalInfo, row.from)
        ? sources.personalInfo[row.from]
        : undefined;
    const source = moved(old, base.personalInfo[row.from] !== row.value);
    if (source) moves.push([row.label, source]);
  }
  return { personalInfo: Object.fromEntries(values), sources: Object.fromEntries(moves) };
}

/** 經歷：以原位置對來源列，逐欄判定已修改。 */
function experiencesOf(
  base: Profile,
  request: ProfileUpdatePayload,
  sources: ProfileSources | undefined,
) {
  const used = new Set<number>();
  const experiences: WorkExperience[] = [];
  const moves: ProfileExperienceSources[] = [];
  for (const { from, ...experience } of request.experiences) {
    experiences.push(experience);
    if (from === null) {
      moves.push(NO_EXPERIENCE_SOURCES);
      continue;
    }
    const old = base.experiences[from];
    if (!old || !claim(used, from, true)) return null;
    const oldSources = sources?.experiences[from];
    const next = { ...NO_EXPERIENCE_SOURCES };
    for (const key of EXPERIENCE_KEYS) {
      next[key] = moved(oldSources?.[key], old[key] !== experience[key]);
    }
    moves.push(next);
  }
  return { experiences, sources: moves };
}

/** 技能：以原位置對來源列。 */
function skillsOf(
  base: Profile,
  request: ProfileUpdatePayload,
  sources: ProfileSources | undefined,
) {
  const used = new Set<number>();
  const skills: string[] = [];
  const moves: (ProfileFieldSource | null)[] = [];
  for (const { value, from } of request.skills) {
    skills.push(value);
    if (from === null) {
      moves.push(null);
      continue;
    }
    const old = base.skills[from];
    if (old === undefined || !claim(used, from, true)) return null;
    moves.push(moved(sources?.skills[from], old !== value));
  }
  return { skills, sources: moves };
}

/** 以請求更新基準 Profile；版本號不符、來源列不對、內容全空都不寫入。 */
export function applyProfileUpdate(base: Profile, request: ProfileUpdatePayload): Applied {
  const version = profileVersionOf(base);
  if (request.baseVersion !== version) return { ok: false, reason: 'profile_conflict' };
  const info = infoOf(base, request, base.sources);
  const experiences = experiencesOf(base, request, base.sources);
  const skills = skillsOf(base, request, base.sources);
  if (!info || !experiences || !skills) return { ok: false, reason: 'bad_source_row' };
  const content = {
    personalInfo: info.personalInfo,
    experiences: experiences.experiences,
    skills: skills.skills,
  };
  if (isEmptyProfileContent(content)) return { ok: false, reason: 'empty_profile' };
  return {
    ok: true,
    profile: {
      id: base.id,
      ...content,
      // 儲存即視為使用者確認（D4），維持已確認（R10）
      pdfParseConfirmed: true,
      version: version + 1,
      sources: {
        personalInfo: info.sources,
        experiences: experiences.sources,
        skills: skills.sources,
      },
    },
  };
}
