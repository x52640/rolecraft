/** 照抄比對用的正規化（P1-T069）：全半形統一（NFKC）、去掉所有空白與零寬字元。 */
const SPACES = /[\s\u200B-\u200D\u2060\uFEFF]/gu;

export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(SPACES, '');
}

/** 段落標題（結束聯絡資料區塊用）；比對前去掉結尾冒號與空白、轉小寫、去空白。 */
const HEADINGS = new Set([
  '學歷',
  '教育',
  '教育背景',
  '工作經驗',
  '工作經歷',
  '經歷',
  '經驗',
  '技能',
  '專長',
  '技能專長',
  '專業技能',
  '自傳',
  '自我介紹',
  '簡介',
  '專案',
  '專案經驗',
  '專案成就',
  '作品',
  '證照',
  '語言能力',
  '語文能力',
  '求職條件',
  'education',
  'experience',
  'workexperience',
  'professionalexperience',
  'skills',
  'summary',
  'profile',
  'about',
  'aboutme',
  'projects',
  'certifications',
  'languages',
]);

export function headingKey(text: string): string {
  return normalizeForMatch(text)
    .replace(/[:：]+$/u, '')
    .toLowerCase();
}

export function isSectionHeading(text: string): boolean {
  return HEADINGS.has(headingKey(text));
}
