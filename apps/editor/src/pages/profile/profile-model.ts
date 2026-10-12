import {
  profileVersionOf,
  type Profile,
  type ProfileExperienceSources,
  type ProfileFieldSource,
  type ProfileUpdatePayload,
} from '@rolecraft/contracts';

/**
 * 個人資料頁的編輯表單（D30；resume-import「個人資料編輯（D30）」）。
 * 每列記下它來自基準版本的哪一列（from；null＝自行新增）與基準的出處（只供顯示）。
 * 出處只在畫面上，送出的 profile.update 請求只有欄位值與來源列（toPayload），不帶出處文字。
 */

export type Source = ProfileFieldSource | null;

export interface InfoRow {
  /** 畫面用的穩定鍵（不送出） */
  readonly key: string;
  readonly from: string | null;
  readonly label: string;
  readonly value: string;
}

export interface ExperienceRow {
  readonly key: string;
  readonly from: number | null;
  readonly company: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  /** 勾選＝至今（endDate 送 null） */
  readonly current: boolean;
  readonly description: string;
}

export interface SkillRow {
  readonly key: string;
  readonly from: number | null;
  readonly value: string;
}

export interface ProfileFormState {
  readonly info: readonly InfoRow[];
  readonly experiences: readonly ExperienceRow[];
  readonly skills: readonly SkillRow[];
}

/** 畫面讀到的基準：版本號、表單初值、出處（以來源列查）。 */
export interface ProfileBase {
  readonly version: number;
  readonly profile: Profile;
  readonly form: ProfileFormState;
}

export type ExperienceKey = 'company' | 'title' | 'startDate' | 'endDate' | 'description';

let seq = 0;
/** 新增列的畫面鍵。 */
export const newKey = (): string => `n${String(++seq)}`;

export const emptyExperience = (): ExperienceRow => ({
  key: newKey(),
  from: null,
  company: '',
  title: '',
  startDate: '',
  endDate: '',
  current: false,
  description: '',
});

/** 讀到的 Profile → 基準（表單每列的 from 指回自己）。 */
export function baseOf(profile: Profile): ProfileBase {
  return {
    version: profileVersionOf(profile),
    profile,
    form: {
      info: Object.entries(profile.personalInfo).map(([label, value], i) => ({
        key: `b${String(i)}`,
        from: label,
        label,
        value,
      })),
      experiences: profile.experiences.map((exp, i) => ({
        key: `b${String(i)}`,
        from: i,
        company: exp.company,
        title: exp.title,
        startDate: exp.startDate,
        endDate: exp.endDate ?? '',
        current: exp.endDate === null,
        description: exp.description,
      })),
      skills: profile.skills.map((value, i) => ({ key: `b${String(i)}`, from: i, value })),
    },
  };
}

/** 某列基本資料的出處（自行新增的沒有）。 */
export function infoSource(base: ProfileBase, from: string | null): Source {
  return from === null ? null : (base.profile.sources?.personalInfo[from] ?? null);
}

/** 某段經歷某欄的出處。 */
export function experienceSource(base: ProfileBase, from: number | null, key: ExperienceKey) {
  if (from === null) return null;
  const sources: ProfileExperienceSources | undefined = base.profile.sources?.experiences[from];
  return sources?.[key] ?? null;
}

export function skillSource(base: ProfileBase, from: number | null): Source {
  return from === null ? null : (base.profile.sources?.skills[from] ?? null);
}

/** 經歷某欄在基準裡的值（比對「已修改」用）；自行新增的回 null。 */
export function baseExperienceValue(base: ProfileBase, from: number | null, key: ExperienceKey) {
  if (from === null) return null;
  const exp = base.profile.experiences[from];
  if (!exp) return null;
  return key === 'endDate' ? (exp.endDate ?? '至今') : exp[key];
}

/** 表單裡經歷某欄目前的值（與 baseExperienceValue 同表示法）。 */
export function experienceValue(row: ExperienceRow, key: ExperienceKey): string {
  if (key === 'endDate') return row.current ? '至今' : row.endDate.trim();
  return key === 'description' ? row.description : row[key].trim();
}

/** 表單 → profile.update 請求（只有欄位值與來源列；單行欄位去頭尾空白）。 */
export function toPayload(form: ProfileFormState, baseVersion: number): ProfileUpdatePayload {
  return {
    baseVersion,
    personalInfo: form.info.map((row) => ({
      label: row.label.trim(),
      value: row.value.trim(),
      from: row.from,
    })),
    experiences: form.experiences.map((row) => ({
      company: row.company.trim(),
      title: row.title.trim(),
      startDate: row.startDate.trim(),
      endDate: row.current ? null : row.endDate.trim(),
      description: row.description,
      from: row.from,
    })),
    skills: form.skills.map((row) => ({ value: row.value.trim(), from: row.from })),
  };
}

/** 有沒有尚未儲存的修改（以送出內容比，含刪除、新增、換順序）。 */
export function isDirty(base: ProfileBase, form: ProfileFormState): boolean {
  return JSON.stringify(toPayload(form, 0)) !== JSON.stringify(toPayload(base.form, 0));
}

/** 儲存前的檢查（同 import.confirm 的驗證）；通過回 null。 */
export function validate(form: ProfileFormState): string | null {
  const labels = form.info.map((row) => row.label.trim());
  if (labels.some((label) => label === '')) return '基本資料的欄位名稱不能空白。';
  if (new Set(labels).size !== labels.length) return '基本資料的欄位名稱不能重複。';
  for (const [i, row] of form.experiences.entries()) {
    const n = String(i + 1);
    if (!row.company.trim() || !row.title.trim() || !row.startDate.trim()) {
      return `經歷 ${n} 的公司、職稱、開始不能空白。`;
    }
    if (!row.current && !row.endDate.trim()) return `經歷 ${n} 的結束要填寫，或勾選「至今」。`;
  }
  if (form.skills.some((row) => !row.value.trim())) return '技能不能空白：請填寫或刪除空的技能。';
  const hasInfo = form.info.some((row) => row.value.trim() !== '');
  if (!hasInfo && form.experiences.length === 0 && form.skills.length === 0) {
    return '內容全空，沒有可寫入的個人資料。';
  }
  return null;
}

/** 這次修改裡會讓既有客製履歷對不到的經歷（改了公司、職稱、開始，或整段刪掉；D30）。 */
export function unmatchedExperiences(base: ProfileBase, form: ProfileFormState) {
  const changed: string[] = [];
  const removed: string[] = [];
  base.profile.experiences.forEach((exp, i) => {
    const name = `${exp.company}｜${exp.title}`;
    const row = form.experiences.find((r) => r.from === i);
    if (!row) {
      removed.push(name);
      return;
    }
    const keys = ['company', 'title', 'startDate'] as const;
    if (keys.some((key) => experienceValue(row, key) !== exp[key])) changed.push(name);
  });
  return { changed, removed };
}
