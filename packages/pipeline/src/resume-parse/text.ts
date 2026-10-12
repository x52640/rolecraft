/** 照抄比對用的正規化（P1-T069）：全半形統一（NFKC）、去掉所有空白與零寬字元。 */
const SPACES = /[\s\u200B-\u200D\u2060\uFEFF]/gu;

export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(SPACES, '');
}

/**
 * NFKC 正規化並記下每個正規化字元（UTF-16 單位）對應的原文範圍，讓在正規化文字上找到的片段能對回原文
 * （全形數字電話、全形 ＠ 等，P1-T069 對抗驗證）。
 */
export interface MappedText {
  readonly text: string;
  /** text[i] 來自原文 [start[i], end[i]) */
  readonly start: readonly number[];
  readonly end: readonly number[];
}

export function nfkcMapped(original: string): MappedText {
  let text = '';
  const start: number[] = [];
  const end: number[] = [];
  let at = 0;
  for (const char of original) {
    const normalized = char.normalize('NFKC');
    for (let i = 0; i < normalized.length; i += 1) {
      start.push(at);
      end.push(at + char.length);
    }
    text += normalized;
    at += char.length;
  }
  return { text, start, end };
}

/**
 * 段落標題（結束聯絡資料區塊用）。詞彙與 resume-import `headingKind` 相同（pipeline 不能依賴 resume-import，
 * 在這裡留一份），另加常見英文變體；比對前去掉結尾冒號、所有空白、轉小寫。
 */
const HEADINGS = new Set([
  '工作經歷',
  '工作經驗',
  '經歷',
  '經驗',
  'experience',
  'workexperience',
  'professionalexperience',
  'employment',
  'employmenthistory',
  'workhistory',
  '技能',
  '專長',
  '技能專長',
  '專業技能',
  'skills',
  'technicalskills',
  'skillset',
  'coreskills',
  '學歷',
  '教育',
  '教育背景',
  '自傳',
  '自我介紹',
  '簡介',
  '專案',
  '專案經驗',
  '作品',
  '證照',
  '語言能力',
  '語文能力',
  '求職條件',
  '專案成就',
  'education',
  'summary',
  'profile',
  'about',
  'aboutme',
  'projects',
  'certifications',
  'languages',
  'awards',
]);

export function headingKey(text: string): string {
  return normalizeForMatch(text)
    .replace(/[:：]+$/u, '')
    .toLowerCase();
}

export function isSectionHeading(text: string): boolean {
  return HEADINGS.has(headingKey(text));
}
