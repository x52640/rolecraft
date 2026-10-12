/**
 * 104 履歷 PDF 的版面專屬規則（P1-T066）。認得出 104 版面才產出結構化草稿；
 * 認不出回傳 null，由通用規則處理。只整理版面上明確的欄位，找不到就留空，不捏造。
 */
import type { DraftField, ExtractedPage, StructuredDraft } from '../../types.ts';
import { parseExperience } from './experience.ts';
import {
  BAND,
  fieldAt,
  isBody,
  isSectionHeading,
  joinWrapped,
  type Located,
  plain,
  sortedLines,
} from './lines.ts';
import { TagCollector } from './tags.ts';

/** 104 特有的段落標題；至少要認到這麼多個（且含「工作經驗」）才算 104 版面。 */
const HEADINGS_104 = [
  '學歷',
  '工作經驗',
  '求職條件',
  '語言能力',
  '語文能力',
  '專長',
  '自傳',
  '專案成就',
];
const MIN_HEADINGS = 3;
const PERSONAL = '';

/** 依段落標題切段；第一個標題之前是個人資料區（鍵為空字串）。同名段落接在一起。 */
function sectionsOf(lines: readonly Located[]): Map<string, Located[]> {
  const sections = new Map<string, Located[]>([[PERSONAL, []]]);
  let current = sections.get(PERSONAL) ?? [];
  for (const at of lines) {
    if (isSectionHeading(at.line)) {
      const name = at.line.text.trim();
      current = sections.get(name) ?? [];
      sections.set(name, current);
    } else {
      current.push(at);
    }
  }
  return sections;
}

type InfoRow = StructuredDraft['personalInfo'][number];

/** 個人資料區：頁首大字第一段是姓名；「標籤 ⇥ 值」行保留原標籤；值換行時接回。 */
function personalInfo(lines: readonly Located[]): InfoRow[] {
  const rows: InfoRow[] = [];
  const add = (label: string, value: DraftField): void => {
    if (label !== '' && value.value !== '' && !rows.some((r) => r.label === label)) {
      rows.push({ label, value });
    }
  };
  const nameLine = lines.find((at) => at.line.height >= BAND.nameMin && at.line.text.trim() !== '');
  const name = nameLine?.line.text.split('\t')[0]?.trim();
  if (nameLine && name) add('姓名', fieldAt(name, nameLine));
  let previous: DraftField | null = null;
  for (const at of lines) {
    const text = at.line.text.trim();
    const tabbed = /^([^\t]{1,10})\t(.+)$/u.exec(text);
    const colon = /^([^：:\t]{1,10})[：:]\s*(\S.*)$/u.exec(text);
    if (tabbed && at.line.x < 40) {
      previous = fieldAt(plain(tabbed[2] ?? ''), at);
      add((tabbed[1] ?? '').trim(), previous);
    } else if (colon && at !== nameLine) {
      add((colon[1] ?? '').trim(), fieldAt(plain(colon[2] ?? ''), at));
      previous = null;
    } else if (previous && isBody(at.line) && at.line.x >= 40 && !text.includes('\t')) {
      previous.value = joinWrapped(previous.value, text);
    } else {
      previous = null;
    }
  }
  return rows;
}

function education(lines: readonly Located[]): InfoRow | null {
  const first = lines[0];
  const value = lines
    .map((at) => plain(at.line.text))
    .filter((t) => t !== '')
    .join('\n');
  return first && value !== '' ? { label: '學歷', value: fieldAt(value, first) } : null;
}

function skillTags(lines: readonly Located[]): DraftField[] {
  const tags = new TagCollector();
  for (const at of lines) tags.take(at);
  return tags.fields();
}

function dedupe(fields: readonly DraftField[]): DraftField[] {
  const seen = new Set<string>();
  return fields.filter((f) => {
    const key = f.value.trim();
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 認出 104 版面就回傳結構化草稿，否則 null。 */
export function build104(pages: readonly ExtractedPage[]): StructuredDraft | null {
  const sections = sectionsOf(sortedLines(pages));
  const known = HEADINGS_104.filter((h) => sections.has(h));
  const work = sections.get('工作經驗');
  if (!work || known.length < MIN_HEADINGS) return null;
  const { experiences, tags } = parseExperience(work);
  // 經歷區塊樣式：至少一段有職稱與右欄日期。
  if (!experiences.some((e) => e.title && e.startDate)) return null;
  const info = personalInfo(sections.get(PERSONAL) ?? []);
  const school = education(sections.get('學歷') ?? []);
  if (school && !info.some((r) => r.label === '學歷')) info.push(school);
  return {
    layout: '104',
    personalInfo: info,
    experiences,
    skills: dedupe([...skillTags(sections.get('專長') ?? []), ...tags]),
  };
}
