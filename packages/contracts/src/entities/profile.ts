import { z } from 'zod';

import { Id, NonEmptyText } from './common.ts';

/**
 * 一段工作經歷。公司、職稱、任職日期由這裡帶入模板，不交給模型生成（R1）。
 * 日期格式 spec 未定，暫為字串。
 */
export const WorkExperience = z.strictObject({
  company: NonEmptyText,
  title: NonEmptyText,
  startDate: NonEmptyText,
  /** null 表示至今 */
  endDate: NonEmptyText.nullable(),
  description: z.string(),
});
export type WorkExperience = z.infer<typeof WorkExperience>;

/** Profile 的欄位值（使用者確認的內容）。import.confirm／profile.update 寫入的就是這些欄位。 */
const PROFILE_FIELDS = {
  /** 個人資料欄位。欄位清單 spec 未定，暫為「欄位名 → 值」。 */
  personalInfo: z.record(z.string().min(1), z.string()),
  /** 完整經歷 */
  experiences: z.array(WorkExperience),
  skills: z.array(NonEmptyText),
};

/** Profile 的欄位值，不含 id、確認旗標、版本號、出處（呼叫端只能送這些；ProfileInput）。 */
export const ProfileContent = z.strictObject(PROFILE_FIELDS);
export type ProfileContent = z.infer<typeof ProfileContent>;

/**
 * Profile 版本號（D30）：helper 管理，import.confirm、profile.update 各加一；舊資料沒有視為 0。
 * 只用來防止蓋掉別處的寫入與履歷版本的過期提示（D30 (a)），不是時間。
 */
export const ProfileVersion = z.int().min(0);
export type ProfileVersion = z.infer<typeof ProfileVersion>;

/** 每欄出處原文上限（字元，以 Unicode 字元計；D30）。超過截斷並標 truncated。 */
export const PROFILE_SOURCE_MAX_CHARS = 300;

/**
 * 一欄的出處（D30，resume-import「個人資料編輯（D30）」）：匯入確認時 helper 從工作階段原文取出的文字，
 * 只供編輯器顯示。不是 Profile 欄位值：不進任何模型提示、不算 R1 檢查 3 的個人資料欄位、不進匯出 PDF。
 * - kind：來源種類（網頁區塊／PDF 行）
 * - text：出處原文（多個出處依序以換行接合），最多 300 字
 * - truncated：原文超過 300 字被截斷
 * - modified：使用者在個人資料頁改過這一欄（顯示的仍是原本的出處）
 */
export const ProfileFieldSource = z.strictObject({
  kind: z.enum(['web', 'pdf']),
  text: z
    .string()
    .min(1)
    .refine((text) => [...text].length <= PROFILE_SOURCE_MAX_CHARS, '出處原文超過上限'),
  truncated: z.boolean(),
  modified: z.boolean(),
});
export type ProfileFieldSource = z.infer<typeof ProfileFieldSource>;

/** 一段經歷各欄的出處；沒有出處為 null（使用者自己填的、比不到草稿的、至今）。 */
export const ProfileExperienceSources = z.strictObject({
  company: ProfileFieldSource.nullable(),
  title: ProfileFieldSource.nullable(),
  startDate: ProfileFieldSource.nullable(),
  endDate: ProfileFieldSource.nullable(),
  description: ProfileFieldSource.nullable(),
});
export type ProfileExperienceSources = z.infer<typeof ProfileExperienceSources>;

/**
 * Profile 各欄的出處（D30）：personalInfo 以欄位名對應（沒有出處的欄位不列）；
 * experiences、skills 與 Profile 同索引（沒有出處為 null）。
 */
export const ProfileSources = z.strictObject({
  personalInfo: z.record(z.string().min(1), ProfileFieldSource),
  experiences: z.array(ProfileExperienceSources),
  skills: z.array(ProfileFieldSource.nullable()),
});
export type ProfileSources = z.infer<typeof ProfileSources>;

/** 出處與欄位對得上：經歷、技能同長度；基本資料的出處只對應存在的欄位。 */
function sourcesAligned(profile: {
  personalInfo: Record<string, string>;
  experiences: readonly unknown[];
  skills: readonly unknown[];
  sources?: ProfileSources | undefined;
}): boolean {
  const { sources } = profile;
  if (sources === undefined) return true;
  return (
    sources.experiences.length === profile.experiences.length &&
    sources.skills.length === profile.skills.length &&
    Object.keys(sources.personalInfo).every((label) => Object.hasOwn(profile.personalInfo, label))
  );
}

/**
 * 個人資料（architecture.md Profile、R10）。
 * D30 相加選填：version（helper 管理的版本號）、sources（各欄出處原文，只供顯示）。
 * 兩者不進 ProfileInput，呼叫端不能送。
 */
export const Profile = z
  .strictObject({
    id: Id,
    ...PROFILE_FIELDS,
    /** PDF 解析結果是否已經使用者確認；確認後才能用於生成（R10） */
    pdfParseConfirmed: z.boolean(),
    version: ProfileVersion.optional(),
    sources: ProfileSources.optional(),
  })
  .refine(sourcesAligned, { path: ['sources'], message: '出處與欄位對不上' });
export type Profile = z.infer<typeof Profile>;

/** Profile 目前的版本號；舊資料沒有視為 0（D30）。 */
export function profileVersionOf(profile: Pick<Profile, 'version'>): number {
  return profile.version ?? 0;
}
