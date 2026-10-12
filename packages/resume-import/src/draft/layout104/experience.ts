/**
 * 104「工作經驗」段：每段以職稱行開始，接著公司、職務類別、內文、#標籤；
 * 右欄日期／年資依版面位置歸到所屬那段（P1-T066）。
 */
import type { DraftField, StructuredExperience } from '../../types.ts';
import {
  type DateRange,
  fieldAt,
  isBody,
  isEntryTitle,
  isSmall,
  joinWrapped,
  type Located,
  metaRanges,
  plain,
} from './lines.ts';
import { TagCollector } from './tags.ts';

interface DescriptionItem {
  text: string;
  at: Located;
  /** 條列（•）起頭的 x；續行縮排比它大就併回同一條 */
  bulletX: number | null;
}

interface Entry {
  title: Located;
  company: Located | null;
  stage: 'company' | 'category' | 'body';
  ranges: { range: DateRange; at: Located }[];
  description: DescriptionItem[];
}

/** 公司行去掉最後一組「（產業 規模）」括號；只在括號內有「人」或「業」時才去，避免誤刪公司名。 */
export function companyName(text: string): string {
  const value = plain(text);
  const match = /\s*[（(]([^（）()]*)[）)]\s*$/u.exec(value);
  if (!match || !/[人業]/u.test(match[1] ?? '')) return value;
  const stripped = value.slice(0, match.index).trim();
  return stripped === '' ? value : stripped;
}

function addDescription(entry: Entry, at: Located): void {
  const text = plain(at.line.text);
  if (text === '') return;
  const last = entry.description.at(-1);
  if (text.startsWith('•')) {
    entry.description.push({ text, at, bulletX: at.line.x });
  } else if (last && last.bulletX !== null && at.line.x > last.bulletX + 2) {
    last.text = joinWrapped(last.text, text);
  } else {
    entry.description.push({ text, at, bulletX: null });
  }
}

const yearMonth = (value: string): number => {
  const [year, month] = value.split('/');
  return Number(year) * 100 + Number(month);
};

/** 一段裡有多個日期區間時：開始取最早、結束取最晚（任一段仍在職就是仍在職）。 */
function datesOf(entry: Entry): Pick<StructuredExperience, 'startDate' | 'endDate' | 'current'> {
  if (entry.ranges.length === 0) return { startDate: null, endDate: null, current: false };
  const first = entry.ranges.reduce((a, b) =>
    yearMonth(b.range.start) < yearMonth(a.range.start) ? b : a,
  );
  const startDate = fieldAt(first.range.start, first.at);
  const current = entry.ranges.find((r) => r.range.end === null);
  if (current) return { startDate, endDate: null, current: true };
  const last = entry.ranges.reduce((a, b) =>
    yearMonth(b.range.end ?? '') > yearMonth(a.range.end ?? '') ? b : a,
  );
  return { startDate, endDate: fieldAt(last.range.end ?? '', last.at), current: false };
}

function toExperience(entry: Entry): StructuredExperience {
  const head = entry.description[0];
  return {
    title: fieldAt(plain(entry.title.line.text), entry.title),
    company: entry.company ? fieldAt(companyName(entry.company.line.text), entry.company) : null,
    ...datesOf(entry),
    description: head ? fieldAt(entry.description.map((d) => d.text).join('\n'), head.at) : null,
  };
}

export interface ExperienceResult {
  experiences: StructuredExperience[];
  tags: DraftField[];
}

/** 整理「工作經驗」段的行（已依版面由上到下排好）。 */
export function parseExperience(lines: readonly Located[]): ExperienceResult {
  const entries: Entry[] = [];
  const tags = new TagCollector();
  for (const at of lines) {
    const { line } = at;
    const current = entries.at(-1);
    const ranges = metaRanges(line.text);
    if (ranges) {
      current?.ranges.push(...ranges.map((range) => ({ range, at })));
      continue;
    }
    if (isEntryTitle(line)) {
      tags.end();
      entries.push({ title: at, company: null, stage: 'company', ranges: [], description: [] });
      continue;
    }
    // 第一段之前（例如「總年資」）不屬於任何經歷。
    if (!current) continue;
    if (current.stage === 'company') {
      current.stage = 'category';
      // 公司行與職稱同一個 x、不是條列。
      const alignedWithTitle = Math.abs(line.x - current.title.line.x) <= 3;
      if (isBody(line) && alignedWithTitle && !line.text.trimStart().startsWith('•')) {
        current.company = at;
        continue;
      }
    }
    if (current.stage === 'category') {
      current.stage = 'body';
      // 「職務類別 | 地點」小字行不進描述。
      if (isSmall(line) && /[|｜]/u.test(line.text) && !line.text.startsWith('#')) continue;
    }
    if (tags.take(at)) continue;
    addDescription(current, at);
  }
  return { experiences: entries.map(toExperience), tags: tags.fields() };
}
