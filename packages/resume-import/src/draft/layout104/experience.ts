/**
 * 104「工作經驗」段：每段以職稱行開始，接著公司（可能換行）、職務類別、內文、#標籤；
 * 右欄日期／年資依幾何綁到同一列的職稱（dates.ts）（P1-T066）。
 */
import type { DraftField, StructuredExperience } from '../../types.ts';
import { bindDates, type DatedEntry, datesOf, type PendingMeta } from './dates.ts';
import {
  fieldAt,
  isBody,
  isEntryTitle,
  isSmall,
  joinWrapped,
  type Located,
  metaRanges,
  plain,
  splitMerged,
} from './lines.ts';
import { TagCollector } from './tags.ts';

interface DescriptionItem {
  text: string;
  at: Located;
  /** 條列（•）起頭的 x；續行縮排比它大就併回同一條 */
  bulletX: number | null;
}

interface Entry extends DatedEntry {
  company: { text: string; at: Located } | null;
  stage: 'company' | 'company_wrap' | 'category' | 'body';
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

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;
/** 括號還沒閉合（公司行換行到下一行）。 */
const unclosed = (text: string): boolean => count(text, /[（(]/gu) > count(text, /[）)]/gu);
/** 104 公司行特徵：結尾「（…業 …人）」。 */
const INDUSTRY_SIZE = /[（(][^（）()]*業[^（）()]*\d[^（）()]*人[^（）()]*[）)]\s*$/u;
const isBullet = (at: Located): boolean => at.line.text.trimStart().startsWith('•');
/** 「職務類別 | 地點」小字行。 */
const isCategory = (at: Located): boolean =>
  isSmall(at.line) && /[|｜]/u.test(at.line.text) && !at.line.text.trimStart().startsWith('#');

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

function toExperience(entry: Entry): StructuredExperience {
  const head = entry.description[0];
  return {
    title: fieldAt(plain(entry.title.line.text), entry.title),
    company: entry.company ? fieldAt(companyName(entry.company.text), entry.company.at) : null,
    ...datesOf(entry),
    description: head ? fieldAt(entry.description.map((d) => d.text).join('\n'), head.at) : null,
  };
}

/** 104 版面訊號（偵測用）。 */
export interface ExperienceSignals {
  /** 至少一個日期在職稱右側（幾何綁定） */
  datesOnRight: boolean;
  /** 公司行有「（…業 …人）」或有「職務類別 | 地點」小字行 */
  companyStyle: boolean;
  /** 職稱字高明顯大於公司與內文 */
  titleTaller: boolean;
}

export interface ExperienceResult {
  experiences: StructuredExperience[];
  tags: DraftField[];
  signals: ExperienceSignals;
}

/** 公司（或換行續行）是否收下這行；收下回傳 true。 */
function takeCompany(entry: Entry, at: Located): boolean {
  const aligned = Math.abs(at.line.x - entry.title.line.x) <= 3;
  if (!isBody(at.line) || !aligned || isBullet(at)) return false;
  const text = plain(at.line.text);
  if (entry.stage === 'company') entry.company = { text, at };
  else if (entry.company) entry.company.text = joinWrapped(entry.company.text, text);
  return true;
}

function signalsOf(entries: readonly Entry[], categoryLine: boolean, onRight: boolean) {
  const bodyHeights = entries.flatMap((e) => [
    ...(e.company ? [e.company.at.line.height] : []),
    ...e.description.map((d) => d.at.line.height),
  ]);
  const tallestBody = Math.max(...bodyHeights);
  const shortestTitle = Math.min(...entries.map((e) => e.title.line.height));
  return {
    datesOnRight: onRight,
    companyStyle: categoryLine || entries.some((e) => INDUSTRY_SIZE.test(e.company?.text ?? '')),
    titleTaller: bodyHeights.length > 0 && shortestTitle >= tallestBody + 0.8,
  };
}

/** 整理「工作經驗」段的行（已依版面由上到下排好）。 */
export function parseExperience(lines: readonly Located[]): ExperienceResult {
  const entries: Entry[] = [];
  const pending: PendingMeta[] = [];
  const tags = new TagCollector();
  let categoryLine = false;
  for (const at of lines.flatMap(splitMerged)) {
    const { line } = at;
    const current = entries.at(-1);
    const ranges = metaRanges(line.text);
    if (ranges) {
      pending.push({ at, ranges, previous: current ?? null });
      continue;
    }
    if (isEntryTitle(line)) {
      tags.end();
      entries.push({ title: at, company: null, stage: 'company', ranges: [], description: [] });
      continue;
    }
    // 第一段之前（例如「總年資」）不屬於任何經歷。
    if (!current) continue;
    if (current.stage === 'company' || current.stage === 'company_wrap') {
      const took = takeCompany(current, at);
      // 換行最多接一行，避免括號沒閉合時把內文也吃進公司。
      const open = took && current.stage === 'company' && unclosed(current.company?.text ?? '');
      current.stage = open ? 'company_wrap' : 'category';
      if (took) continue;
    }
    if (current.stage === 'category') {
      // 公司後到第一個內文或條列前的「X | Y」小字行都略過。
      if (isCategory(at)) {
        categoryLine = true;
        continue;
      }
      current.stage = 'body';
    }
    if (tags.take(at)) continue;
    addDescription(current, at);
  }
  const onRight = bindDates(pending, entries);
  return {
    experiences: entries.map(toExperience),
    tags: tags.fields(),
    signals: signalsOf(entries, categoryLine, onRight),
  };
}
