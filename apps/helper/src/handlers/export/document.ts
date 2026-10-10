// 由 Profile＋ResumeVersion 各段組出要印的 ResumeDocument（P1-T040，D15 中文單一模板）。
// 規則：
// - 姓名、聯絡方式、公司、職稱、任職日期、技能一律取自 Profile（R1：不交給模型生成）；
//   Profile 必須已經使用者確認（R10），所以這些欄位都是使用者確認過的文字。
// - 履歷各段原文照印（一段＝一個項目），不改寫、不補字；只印 R1 檢查過的段落。
// - R1 跳過的「實質空白」段落不印（見 isPrintable），沒有歸屬的段落不能匯出。
import { checkExportReadiness } from '@rolecraft/domain';
import type {
  ContactItem,
  ResumeDocument,
  TemplateItem,
  TemplateSection,
} from '@rolecraft/pdf-export';
import type { Profile, ResumeSection, WorkExperience } from '@rolecraft/contracts';

/** 姓名欄位名（P1-T020 匯入流程與測試樣本用的鍵）。 */
export const NAME_KEY = '姓名';

/** 會印成聯絡方式的個人資料欄位（依此順序）；其餘欄位（生日等）不印。 */
export const CONTACT_KEYS = ['電話', '電子郵件', '個人網站', '地點'] as const;

export const HEADINGS = {
  summary: '自我介紹',
  experience: '工作經歷',
  project: '專案',
  skills: '技能',
} as const;

export type DocumentProblem =
  | { readonly reason: 'profile_name_missing' }
  | { readonly reason: 'placement_missing'; readonly sectionId: string }
  | { readonly reason: 'experience_not_found'; readonly sectionId: string };

export type DocumentBuild =
  | {
      readonly ok: true;
      readonly document: ResumeDocument;
      /** 實際印出的段落（依原順序）；匯出版本只存這些（R3：與 PDF 內容一致） */
      readonly printedSections: readonly ResumeSection[];
    }
  | { readonly ok: false; readonly problem: DocumentProblem };

/**
 * R1 會跳過「實質空白」的段落（去掉不可見字元後沒內容），所以它們也不能印。
 * domain 沒有公開這個判定，這裡用公開的 checkExportReadiness 探測：
 * 非空白、無引用、未逐段確認的段落一定會得到「沒有引用」問題；只有被跳過的段落才會是 ok。
 */
export function isPrintable(section: ResumeSection): boolean {
  const probe = checkExportReadiness({
    sections: [
      {
        id: section.id,
        origin: 'user_written',
        text: section.text,
        citations: [],
        sectionConfirmation: null,
      },
    ],
    claims: [],
    profile: null,
  });
  return !probe.ok;
}

function contactOf(key: string, value: string): ContactItem | null {
  const text = value.trim();
  if (text === '') return null;
  if (key === '電子郵件' && /^[^\s@]+@[^\s@]+$/u.test(text)) {
    return { text, href: `mailto:${text}` };
  }
  if (key === '個人網站' && /^https?:\/\/\S+$/iu.test(text)) return { text, href: text };
  return { text };
}

function item(section: ResumeSection): TemplateItem {
  return section.itemKind === 'bullet'
    ? { kind: 'bullet', text: section.text }
    : { kind: 'paragraph', text: section.text };
}

function entryOf(exp: WorkExperience): TemplateItem {
  return {
    kind: 'entry',
    title: `${exp.company}｜${exp.title}`,
    meta: `${exp.startDate} – ${exp.endDate ?? '至今'}`,
  };
}

/** 段落對到的經歷位置；對不到回 -1。 */
function experienceIndex(profile: Profile, section: ResumeSection): number {
  const p = section.placement;
  if (p?.group !== 'experience') return -1;
  return profile.experiences.findIndex(
    (e) => e.company === p.company && e.title === p.title && e.startDate === p.startDate,
  );
}

/** 組出要印的文件。sections 必須就是剛跑過 R1 的那一份（呼叫端保證，見 export-service.ts）。 */
export function buildResumeDocument(
  profile: Profile,
  sections: readonly ResumeSection[],
): DocumentBuild {
  const name = profile.personalInfo[NAME_KEY]?.trim() ?? '';
  if (name === '') return { ok: false, problem: { reason: 'profile_name_missing' } };

  const printed = sections.filter(isPrintable);
  const summary: TemplateItem[] = [];
  const projects: TemplateItem[] = [];
  const byExperience: TemplateItem[][] = profile.experiences.map(() => []);
  for (const section of printed) {
    switch (section.placement?.group) {
      case undefined:
        return { ok: false, problem: { reason: 'placement_missing', sectionId: section.id } };
      case 'summary':
        summary.push(item(section));
        break;
      case 'project':
        projects.push(item(section));
        break;
      case 'experience': {
        const index = experienceIndex(profile, section);
        const bucket = byExperience[index];
        if (bucket === undefined) {
          return { ok: false, problem: { reason: 'experience_not_found', sectionId: section.id } };
        }
        bucket.push(item(section));
        break;
      }
    }
  }

  const experience = profile.experiences.flatMap((exp, i) => [
    entryOf(exp),
    ...(byExperience[i] ?? []),
  ]);
  const skills: TemplateItem[] =
    profile.skills.length > 0 ? [{ kind: 'paragraph', text: profile.skills.join('・') }] : [];
  const groups: TemplateSection[] = [
    { heading: HEADINGS.summary, items: summary },
    { heading: HEADINGS.experience, items: experience },
    { heading: HEADINGS.project, items: projects },
    { heading: HEADINGS.skills, items: skills },
  ].filter((g) => g.items.length > 0);

  const contacts = CONTACT_KEYS.flatMap((key) => {
    const value = profile.personalInfo[key];
    const contact = value === undefined ? null : contactOf(key, value);
    return contact === null ? [] : [contact];
  });

  return {
    ok: true,
    document: { name, contacts, sections: groups },
    printedSections: printed,
  };
}
