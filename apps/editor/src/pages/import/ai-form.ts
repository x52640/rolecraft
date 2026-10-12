// AI 整理（P1-T069）的草稿 → 表單初值，與畫面文字。草稿裡每個值都已在 helper 逐欄對照過原文；
// 這裡只搬進表單，一律未確認，由使用者逐欄核對後才寫入（R10）。
import type { ImportAiDiscardReason, ImportAiFailure, ImportDraft } from '@rolecraft/contracts';

import type { ExperienceKey, ProfileForm } from './form-model.ts';

/** 表單目前是用什麼預填的（畫面標明來源）。 */
export type PrefillSource = 'ai' | 'layout104' | 'rules' | 'manual';

export const PREFILL_LABELS: Record<PrefillSource, string> = {
  ai: 'AI 整理（每個值都對照過原文）',
  layout104: '104 版面規則',
  rules: '通用規則',
  manual: '手動輸入',
};

/** 還原出姓名或聯絡資料的欄位標示文字（D28／W7）。 */
export const PERSONAL_MARK = '含姓名或聯絡資料';

export function rulesSource(draft: ImportDraft): PrefillSource {
  return draft.structured ? 'layout104' : 'rules';
}

export const AI_FAILURE_TEXT: Record<ImportAiFailure, string> = {
  invalid_output: 'AI 回傳的格式不符，整份不採用（不會自動重試）',
  run_check_failed: '送出前的訂閱檢查沒有通過，未送出',
  provider_error: 'AI 服務發生錯誤',
  quota_exhausted: '訂閱額度已用完',
  cancelled: '已取消',
};

export const DISCARD_TEXT: Record<ImportAiDiscardReason, string> = {
  not_in_source: '原文找不到這個值',
  unknown_line: '引用的行不存在或是聯絡資料行',
  lines_not_consecutive: '引用的行不連續',
  not_a_date: '不是日期',
  empty: '空白',
};

/** 草稿欄位的共同形狀：PDF（頁／行）與網頁（區塊編號）出處不同，表單只用值與個資旗標。 */
export interface AiFieldLike {
  readonly value: string;
  readonly containsPersonalData?: boolean | undefined;
}

/** PDF 的 ImportAiDraft 與網頁的 ImportWebAiDraft 共同的形狀（D28：結構相同、出處不同）。 */
export interface AiDraftLike {
  readonly personalInfo: readonly { readonly label: string; readonly value: AiFieldLike }[];
  readonly education: readonly AiFieldLike[];
  readonly experiences: readonly {
    readonly company: AiFieldLike | null;
    readonly title: AiFieldLike | null;
    readonly startDate: AiFieldLike | null;
    readonly endDate: AiFieldLike | null;
    readonly current: boolean;
    readonly description: AiFieldLike | null;
  }[];
  readonly skills: readonly AiFieldLike[];
  readonly otherSections: readonly { readonly heading: AiFieldLike; readonly body: AiFieldLike }[];
  readonly discarded: readonly { readonly field: string; readonly reason: ImportAiDiscardReason }[];
}

const flagged = (field: AiFieldLike | null | undefined): boolean =>
  field?.containsPersonalData === true;

/** 技能去空白、去重；同一值任何一個有個資旗標就標示（與 skills 同索引）。 */
function skillRows(skills: readonly { value: string; personal: boolean }[]) {
  const personal = new Map<string, boolean>();
  for (const s of skills) {
    if (s.value !== '') personal.set(s.value, (personal.get(s.value) ?? false) || s.personal);
  }
  return { skills: [...personal.keys()], personalSkills: [...personal.values()] };
}

const EXPERIENCE_KEYS: readonly ExperienceKey[] = [
  'company',
  'title',
  'startDate',
  'endDate',
  'description',
];

/**
 * AI 草稿 → 表單：姓名列固定第一；學歷併成一列「學歷」；其他段落不進表單（不寫入個人資料）。
 * 還原出姓名或聯絡資料的欄位（D28／W7）帶標示，提醒使用者確認前刪掉。
 */
export function formFromAiDraft(draft: AiDraftLike): ProfileForm {
  const name = draft.personalInfo.find((row) => row.label === '姓名');
  const others = draft.personalInfo
    .filter((row) => row.label !== '姓名')
    .map((row) => ({ label: row.label, value: row.value.value, personal: flagged(row.value) }));
  const education = draft.education.map((field) => field.value).join('\n');
  const hasEducation = others.some((row) => row.label === '學歷');
  const educationRow = { label: '學歷', value: education, personal: draft.education.some(flagged) };
  const skills = draft.skills.map((s) => ({ value: s.value.trim(), personal: flagged(s) }));
  return {
    info: [
      { label: '姓名', value: name?.value.value ?? '', personal: flagged(name?.value) },
      ...others,
      ...(education !== '' && !hasEducation ? [educationRow] : []),
    ],
    experiences: draft.experiences.map((e) => ({
      company: e.company?.value ?? '',
      title: e.title?.value ?? '',
      startDate: e.startDate?.value ?? '',
      endDate: e.current ? '' : (e.endDate?.value ?? ''),
      current: e.current,
      description: e.description?.value ?? '',
      personal: EXPERIENCE_KEYS.filter((key) => flagged(e[key])),
    })),
    ...skillRows(skills),
  };
}
