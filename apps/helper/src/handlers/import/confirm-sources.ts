// import.confirm 的各欄出處（D30，resume-import「個人資料編輯（D30）」「出處」）：確認的值與草稿欄位的值相同
// （照抄檢查的正規化：去空白、NFKC）才記下那個欄位的出處原文。經歷先以公司＋職稱＋開始對到草稿經歷再逐欄比；
// 技能以值比；「學歷」列另比所有學歷欄位接合的值。出處文字一律從工作階段原文（draft.units）取。
import {
  PROFILE_SOURCE_MAX_CHARS,
  type ProfileContent,
  type ProfileExperienceSources,
  type ProfileFieldSource,
  type ProfileSources,
} from '@rolecraft/contracts';
import { normalizeForMatch } from '@rolecraft/pipeline';

import type { DraftExperience, DraftValue, SourceDraft } from './confirm-draft.ts';

/** 只有一個出處單位卻不含整個值時（本機預填的多行欄位只記第一行），最多往後補幾個單位。 */
const MAX_EXTEND_UNITS = 30;

const norm = normalizeForMatch;
const same = (a: string, b: string): boolean => norm(a) === norm(b);

/** 出處單位位置 → 原文（多個依序以換行接合），超過上限截斷並標示。 */
function sourceText(draft: SourceDraft, at: readonly number[], value: string) {
  let positions = [...new Set(at)];
  const first = positions[0];
  if (positions.length === 1 && first !== undefined) {
    const target = norm(value);
    for (let last = first; last < first + MAX_EXTEND_UNITS && last < draft.units.length; last++) {
      if (norm(draft.units.slice(first, last + 1).join('')).includes(target)) {
        positions = Array.from({ length: last - first + 1 }, (_, i) => first + i);
        break;
      }
    }
  }
  const text = positions.map((i) => draft.units[i] ?? '').join('\n');
  if (!/\S/u.test(text)) return null;
  const chars = [...text];
  const truncated = chars.length > PROFILE_SOURCE_MAX_CHARS;
  return { text: truncated ? chars.slice(0, PROFILE_SOURCE_MAX_CHARS).join('') : text, truncated };
}

function sourceOf(draft: SourceDraft, at: readonly number[], value: string) {
  const found = sourceText(draft, at, value);
  return found ? { kind: draft.kind, ...found, modified: false } : null;
}

/** 值相同才記下該草稿欄位的出處。 */
function fieldSource(draft: SourceDraft, field: DraftValue | null, value: string | null) {
  if (!field || value === null || !/\S/u.test(value) || !same(field.value, value)) return null;
  return sourceOf(draft, field.at, value);
}

function infoSource(draft: SourceDraft, label: string, value: string): ProfileFieldSource | null {
  if (!/\S/u.test(value)) return null;
  const row = draft.personalInfo.find((r) => same(r.label, label) && same(r.field.value, value));
  if (row) return sourceOf(draft, row.field.at, value);
  // 「學歷」列：比對所有學歷欄位接合的值（匯入頁把學歷併成一列）
  const education = draft.education;
  if (!same(label, '學歷') || education.length === 0) return null;
  if (!same(education.map((f) => f.value).join(''), value)) return null;
  return sourceOf(
    draft,
    education.flatMap((f) => f.at),
    value,
  );
}

const NO_SOURCES: ProfileExperienceSources = {
  company: null,
  title: null,
  startDate: null,
  endDate: null,
  description: null,
};

function experienceSources(
  draft: SourceDraft,
  experiences: ProfileContent['experiences'],
): ProfileExperienceSources[] {
  const used = new Set<DraftExperience>();
  return experiences.map((e) => {
    const match = draft.experiences.find(
      (d) =>
        !used.has(d) &&
        d.company !== null &&
        d.title !== null &&
        d.startDate !== null &&
        same(d.company.value, e.company) &&
        same(d.title.value, e.title) &&
        same(d.startDate.value, e.startDate),
    );
    if (!match) return NO_SOURCES;
    used.add(match);
    return {
      company: fieldSource(draft, match.company, e.company),
      title: fieldSource(draft, match.title, e.title),
      startDate: fieldSource(draft, match.startDate, e.startDate),
      endDate: fieldSource(draft, match.endDate, e.endDate),
      description: fieldSource(draft, match.description, e.description),
    };
  });
}

/** 確認內容各欄的出處；沒有草稿（手動輸入、網頁沒有 AI 草稿）時全部沒有出處。 */
export function confirmSources(draft: SourceDraft | null, profile: ProfileContent): ProfileSources {
  if (!draft) {
    return {
      personalInfo: {},
      experiences: profile.experiences.map(() => NO_SOURCES),
      skills: profile.skills.map(() => null),
    };
  }
  const info: [string, ProfileFieldSource][] = [];
  for (const [label, value] of Object.entries(profile.personalInfo)) {
    const source = infoSource(draft, label, value);
    if (source) info.push([label, source]);
  }
  return {
    personalInfo: Object.fromEntries(info),
    experiences: experienceSources(draft, profile.experiences),
    skills: profile.skills.map((skill) =>
      fieldSource(draft, draft.skills.find((s) => same(s.value, skill)) ?? null, skill),
    ),
  };
}
