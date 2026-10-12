// AI 整理（P1-T069）的草稿 → 表單初值，與畫面文字。草稿裡每個值都已在 helper 逐欄對照過原文；
// 這裡只搬進表單，一律未確認，由使用者逐欄核對後才寫入（R10）。
import type {
  ImportAiDiscardReason,
  ImportAiDraft,
  ImportAiFailure,
  ImportDraft,
} from '@rolecraft/contracts';

import type { ProfileForm } from './form-model.ts';

/** 表單目前是用什麼預填的（畫面標明來源）。 */
export type PrefillSource = 'ai' | 'layout104' | 'rules' | 'manual';

export const PREFILL_LABELS: Record<PrefillSource, string> = {
  ai: 'AI 整理（每個值都對照過原文）',
  layout104: '104 版面規則',
  rules: '通用規則',
  manual: '手動輸入',
};

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

/** AI 草稿 → 表單：姓名列固定第一；學歷併成一列「學歷」；其他段落不進表單（不寫入個人資料）。 */
export function formFromAiDraft(draft: ImportAiDraft): ProfileForm {
  const name = draft.personalInfo.find((row) => row.label === '姓名');
  const others = draft.personalInfo
    .filter((row) => row.label !== '姓名')
    .map((row) => ({ label: row.label, value: row.value.value }));
  const education = draft.education.map((field) => field.value).join('\n');
  const hasEducation = others.some((row) => row.label === '學歷');
  return {
    info: [
      { label: '姓名', value: name?.value.value ?? '' },
      ...others,
      ...(education !== '' && !hasEducation ? [{ label: '學歷', value: education }] : []),
    ],
    experiences: draft.experiences.map((e) => ({
      company: e.company?.value ?? '',
      title: e.title?.value ?? '',
      startDate: e.startDate?.value ?? '',
      endDate: e.current ? '' : (e.endDate?.value ?? ''),
      current: e.current,
      description: e.description?.value ?? '',
    })),
    skills: [...new Set(draft.skills.map((s) => s.value.trim()).filter((s) => s !== ''))],
  };
}
