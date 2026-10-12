/**
 * 欄位草稿的粗略規則（中英文）。只找得到明確線索的才算，找不到就不填，不捏造。
 */

export type SectionKind = 'experience' | 'skills' | 'other';

const SECTION_HEADINGS: Record<SectionKind, readonly string[]> = {
  experience: [
    '工作經歷',
    '工作經驗',
    '經歷',
    '經驗',
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'employment history',
  ],
  skills: ['技能', '專長', '技能專長', '專業技能', 'skills', 'technical skills', 'skill set'],
  other: [
    '學歷',
    '教育',
    '教育背景',
    '自傳',
    '自我介紹',
    '簡介',
    '專案',
    '作品',
    '證照',
    '語言能力',
    '語文能力',
    '求職條件',
    '專案成就',
    '聯絡方式',
    '基本資料',
    'education',
    'summary',
    'profile',
    'about',
    'about me',
    'projects',
    'certifications',
    'languages',
    'contact',
  ],
};

function normalizeHeading(text: string): string {
  return text
    .replace(/[:：\s]+$/u, '')
    .trim()
    .toLowerCase();
}

/** 這一行是不是段落標題；是的話回傳段落種類。 */
export function headingKind(text: string): SectionKind | null {
  const key = normalizeHeading(text);
  for (const kind of ['experience', 'skills', 'other'] as const) {
    if (SECTION_HEADINGS[kind].includes(key)) return kind;
  }
  return null;
}

/** 「標籤：值」形式。 */
export function labeledValue(text: string, labels: readonly string[]): string | null {
  const match = /^([^:：]{1,20})\s*[:：]\s*(.+)$/u.exec(text.trim());
  if (!match) return null;
  const label = (match[1] ?? '').trim().toLowerCase();
  const value = (match[2] ?? '').trim();
  return labels.includes(label) && value !== '' ? value : null;
}

export const NAME_LABELS = ['姓名', '名字', 'name', 'full name'];
export const COMPANY_LABELS = ['公司', '公司名稱', '任職公司', 'company', 'employer'];
export const TITLE_LABELS = ['職稱', '職位', '職務', 'title', 'job title', 'position'];
export const SKILL_LABELS = ['技能', '專長', 'skills'];

const DATE = String.raw`(?:19|20)\d{2}(?:\s*[./\-年]\s*\d{1,2}\s*月?)?`;
const MONTH_DATE = String.raw`(?:19|20)\d{2}\s*[./\-年]\s*\d{1,2}\s*月?`;
const RANGE = new RegExp(
  String.raw`${DATE}\s*(?:~|～|-|–|—|至|to)\s*(?:${DATE}|至今|迄今|現在|present|now|current)`,
  'giu',
);
const SINGLE = new RegExp(MONTH_DATE, 'gu');

/** 找日期：先找區間（2020/01 ~ 至今），其餘再找帶月份的單一日期。只有年份的不算。 */
export function findDates(text: string): string[] {
  const ranges = [...text.matchAll(RANGE)].map((m) => m[0].trim());
  const rest = text.replace(RANGE, ' ');
  const singles = [...rest.matchAll(SINGLE)].map((m) => m[0].trim());
  return [...ranges, ...singles];
}

export function stripDates(text: string): string {
  return text.replace(RANGE, ' ').replace(SINGLE, ' ');
}

/** 以常見分隔符切段（｜、|、•、·、Tab、兩個以上空白）。 */
export function segments(text: string): string[] {
  return text
    .split(/\s*[|｜•·\t]\s*|\s{2,}/u)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

const ZH_COMPANY = /^(.*?(?:股份有限公司|有限公司|公司))/u;
const EN_COMPANY = /^(.*?\b(?:Inc|Ltd|Corp|Corporation|LLC|GmbH|Co)\b\.?)(?=\s|,|$)/u;

/** 從一段文字取出公司名（以公司字尾判斷），取不到回傳 null。 */
export function companyIn(segment: string): string | null {
  const match = ZH_COMPANY.exec(segment) ?? EN_COMPANY.exec(segment);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

const TITLE_WORDS =
  /(工程師|經理|主任|專員|設計師|顧問|分析師|主管|助理|總監|實習生|\b(?:engineer|developer|manager|designer|analyst|consultant|director|intern|architect|scientist)\b)/iu;
const MAX_TITLE_LENGTH = 40;

/** 這段文字看起來是職稱嗎（含職稱關鍵字且不長）。 */
export function looksLikeTitle(segment: string): boolean {
  return segment.length <= MAX_TITLE_LENGTH && TITLE_WORDS.test(segment);
}

/** 技能清單以逗號、頓號、分號、斜線、Tab（版面上的欄位間距）切開。 */
export function splitSkills(text: string): string[] {
  return text
    .split(/[,，、;；|｜/\t]/u)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}
