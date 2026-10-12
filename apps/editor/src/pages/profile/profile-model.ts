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

/** 自有屬性才算（標籤可能是 constructor、toString 等，不能取到繼承成員）。 */
function own<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** 基準裡某列基本資料的值；自行新增或不存在回 undefined。 */
export function baseInfoValue(base: ProfileBase, from: string | null): string | undefined {
  return from === null ? undefined : own(base.profile.personalInfo, from);
}

/** 某列基本資料的出處（自行新增的沒有）。 */
export function infoSource(base: ProfileBase, from: string | null): Source {
  return from === null ? null : (own(base.profile.sources?.personalInfo, from) ?? null);
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

/**
 * 要送出的值：與基準完全相同（使用者沒動）就原樣送回；改過的才去頭尾空白。
 * 這樣沒動的欄位不會因為修剪而被改寫、被 helper 標「已修改」。
 */
export function sendValue(value: string, old: string | null | undefined): string {
  return old !== undefined && old !== null && value === old ? value : value.trim();
}

/** 經歷某欄在基準裡的原值（endDate 至今為 null）；自行新增的回 undefined。 */
function baseExperienceRaw(base: ProfileBase, from: number | null, key: ExperienceKey) {
  if (from === null) return undefined;
  return base.profile.experiences[from]?.[key];
}

/** 經歷某欄要送出的值（endDate 至今為 null；描述原樣）。 */
function sentExperienceValue(base: ProfileBase, row: ExperienceRow, key: ExperienceKey) {
  if (key === 'endDate' && row.current) return null;
  if (key === 'description') return row.description;
  return sendValue(row[key], baseExperienceRaw(base, row.from, key));
}

/** 經歷某欄跟基準比有沒有改（「已修改」顯示用）；自行新增的回 false。 */
export function experienceChanged(base: ProfileBase, row: ExperienceRow, key: ExperienceKey) {
  const old = baseExperienceRaw(base, row.from, key);
  return old !== undefined && sentExperienceValue(base, row, key) !== old;
}

/** 表單 → profile.update 請求（只有欄位值與來源列；改過的單行欄位去頭尾空白）。 */
export function toPayload(form: ProfileFormState, base: ProfileBase): ProfileUpdatePayload {
  return {
    baseVersion: base.version,
    personalInfo: form.info.map((row) => ({
      label: sendValue(row.label, row.from),
      value: sendValue(row.value, baseInfoValue(base, row.from)),
      from: row.from,
    })),
    experiences: form.experiences.map((row) => ({
      company: sendValue(row.company, baseExperienceRaw(base, row.from, 'company')),
      title: sendValue(row.title, baseExperienceRaw(base, row.from, 'title')),
      startDate: sendValue(row.startDate, baseExperienceRaw(base, row.from, 'startDate')),
      endDate: sentExperienceValue(base, row, 'endDate'),
      description: row.description,
      from: row.from,
    })),
    skills: form.skills.map((row) => ({
      value: sendValue(row.value, row.from === null ? undefined : base.profile.skills[row.from]),
      from: row.from,
    })),
  };
}

/** 有沒有尚未儲存的修改（以送出內容比，含刪除、新增、換順序）。 */
export function isDirty(base: ProfileBase, form: ProfileFormState): boolean {
  return JSON.stringify(toPayload(form, base)) !== JSON.stringify(toPayload(base.form, base));
}

/** 儲存前的檢查（同 import.confirm 的驗證，以要送出的值檢查）；通過回 null。 */
export function validate(form: ProfileFormState, base: ProfileBase): string | null {
  const payload = toPayload(form, base);
  const labels = payload.personalInfo.map((row) => row.label);
  if (labels.some((label) => !/\S/u.test(label))) return '基本資料的欄位名稱不能空白。';
  if (new Set(labels).size !== labels.length) return '基本資料的欄位名稱不能重複。';
  for (const [i, row] of payload.experiences.entries()) {
    const n = String(i + 1);
    const blank = (v: string) => !/\S/u.test(v);
    if (blank(row.company) || blank(row.title) || blank(row.startDate)) {
      return `經歷 ${n} 的公司、職稱、開始不能空白。`;
    }
    if (row.endDate !== null && blank(row.endDate)) {
      return `經歷 ${n} 的結束要填寫，或勾選「至今」。`;
    }
  }
  if (payload.skills.some((row) => !/\S/u.test(row.value))) {
    return '技能不能空白：請填寫或刪除空的技能。';
  }
  const hasInfo = payload.personalInfo.some((row) => /\S/u.test(row.value));
  if (!hasInfo && payload.experiences.length === 0 && payload.skills.length === 0) {
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
    if (keys.some((key) => experienceChanged(base, row, key))) changed.push(name);
  });
  return { changed, removed };
}
