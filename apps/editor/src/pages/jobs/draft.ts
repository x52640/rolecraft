import type { JobFields, OptionalFieldResult } from '@rolecraft/contracts';

/**
 * 職缺欄位的編輯草稿：表單上全部是文字；選用欄位空白時另記「未擷取到／頁面未提供」（R10）。
 * 欄位內容只是資料（D6），這裡不解讀、不改寫。
 */

export type EmptyStatus = 'not_captured' | 'not_provided';

export interface OptionalDraft {
  value: string;
  /** 內容空白時要標成哪一種。 */
  emptyStatus: EmptyStatus;
}

export const REQUIRED_KEYS = ['company', 'title', 'description'] as const;
export type RequiredKey = (typeof REQUIRED_KEYS)[number];

export const OPTIONAL_KEYS = [
  'responsibilities',
  'requirements',
  'preferredQualifications',
  'location',
] as const;
export type OptionalKey = (typeof OPTIONAL_KEYS)[number];

export type JobFieldsDraft = Record<RequiredKey, string> & Record<OptionalKey, OptionalDraft>;

export type DraftErrors = Partial<Record<RequiredKey, string>>;

const hasText = (value: string): boolean => /\S/u.test(value);

/** 手動貼上的初始草稿：選用欄位空白時預設「未擷取到」（不替頁面斷言沒有提供）。 */
export function emptyDraft(): JobFieldsDraft {
  const blank = (): OptionalDraft => ({ value: '', emptyStatus: 'not_captured' });
  return {
    company: '',
    title: '',
    description: '',
    responsibilities: blank(),
    requirements: blank(),
    preferredQualifications: blank(),
    location: blank(),
  };
}

function optionalToDraft(result: OptionalFieldResult): OptionalDraft {
  return result.status === 'captured'
    ? { value: result.value, emptyStatus: 'not_captured' }
    : { value: '', emptyStatus: result.status };
}

function optionalFromDraft(draft: OptionalDraft): OptionalFieldResult {
  return hasText(draft.value)
    ? { status: 'captured', value: draft.value }
    : { status: draft.emptyStatus };
}

export function draftFromFields(fields: JobFields): JobFieldsDraft {
  return {
    company: fields.company,
    title: fields.title,
    description: fields.description,
    responsibilities: optionalToDraft(fields.responsibilities),
    requirements: optionalToDraft(fields.requirements),
    preferredQualifications: optionalToDraft(fields.preferredQualifications),
    location: optionalToDraft(fields.location),
  };
}

/** 草稿 → 欄位；必要欄位空白時回錯誤（R10：缺必要欄位不建快照）。 */
export function fieldsFromDraft(
  draft: JobFieldsDraft,
): { ok: true; fields: JobFields } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  for (const key of REQUIRED_KEYS) {
    if (!hasText(draft[key])) errors[key] = '必填，不可空白';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      company: draft.company,
      title: draft.title,
      description: draft.description,
      responsibilities: optionalFromDraft(draft.responsibilities),
      requirements: optionalFromDraft(draft.requirements),
      preferredQualifications: optionalFromDraft(draft.preferredQualifications),
      location: optionalFromDraft(draft.location),
    },
  };
}

/** 兩份草稿轉成欄位後是否相同（空白選用欄位只比標示）。 */
export function sameDraft(a: JobFieldsDraft, b: JobFieldsDraft): boolean {
  const normalize = (d: JobFieldsDraft) => {
    const converted = fieldsFromDraft(d);
    return JSON.stringify(converted.ok ? converted.fields : d);
  };
  return normalize(a) === normalize(b);
}
