import type { DraftField, ExtractedPage, ResumeFieldDraft } from '../types.ts';
import {
  COMPANY_LABELS,
  companyIn,
  findDates,
  headingKind,
  labeledValue,
  looksLikeTitle,
  NAME_LABELS,
  type SectionKind,
  segments,
  SKILL_LABELS,
  splitSkills,
  stripDates,
  TITLE_LABELS,
} from './rules.ts';

function field(value: string, pageNumber: number, lineIndex: number): DraftField {
  return { value, status: 'unconfirmed', source: { pageNumber, lineIndex } };
}

/** 一行裡的公司與職稱：先看標籤，再看公司字尾與職稱關鍵字。 */
function companiesAndTitles(text: string): { companies: string[]; titles: string[] } {
  // 標籤後只取第一段：同一行後面可能是 Tab 隔開的其他欄位。
  const labeledCompany = segments(labeledValue(text, COMPANY_LABELS) ?? '')[0];
  const labeledTitle = segments(labeledValue(text, TITLE_LABELS) ?? '')[0];
  if (labeledCompany || labeledTitle) {
    return {
      companies: labeledCompany ? [labeledCompany] : [],
      titles: labeledTitle ? [labeledTitle] : [],
    };
  }
  const companies: string[] = [];
  const titles: string[] = [];
  for (const segment of segments(stripDates(text))) {
    const company = companyIn(segment);
    const rest = company ? segment.slice(company.length).trim() : segment;
    if (company) companies.push(company);
    if (rest !== '' && looksLikeTitle(rest)) titles.push(rest);
  }
  return { companies, titles };
}

/**
 * 把排好閱讀順序的行粗略整理成待校正欄位草稿。
 * 每個欄位都標「未確認」並記錄來源頁碼與行號；沒有線索的欄位留空。
 */
export function buildDraft(pages: readonly ExtractedPage[]): ResumeFieldDraft {
  const draft: ResumeFieldDraft = {
    name: null,
    dates: [],
    companies: [],
    titles: [],
    experiences: [],
    skills: [],
  };
  let section: SectionKind | null = null;
  for (const page of pages) {
    page.lines.forEach((line, lineIndex) => {
      const at = (value: string): DraftField => field(value, page.pageNumber, lineIndex);
      const text = line.text;
      const heading = headingKind(text);
      if (heading) {
        section = heading;
        return;
      }
      // 姓名只取標籤後的第一段（頁首常把姓名、城市、信箱排在同一行）。
      const name = segments(labeledValue(text, NAME_LABELS) ?? '')[0];
      if (name && !draft.name) draft.name = at(name);
      draft.dates.push(...findDates(text).map(at));
      const { companies, titles } = companiesAndTitles(text);
      draft.companies.push(...companies.map(at));
      draft.titles.push(...titles.map(at));
      const labeledSkills = labeledValue(text, SKILL_LABELS);
      if (labeledSkills) draft.skills.push(...splitSkills(labeledSkills).map(at));
      else if (section === 'skills') draft.skills.push(...splitSkills(text).map(at));
      if (section === 'experience') draft.experiences.push(at(text));
    });
  }
  return draft;
}
