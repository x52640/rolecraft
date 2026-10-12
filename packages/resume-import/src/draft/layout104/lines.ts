/**
 * 104 履歷版面的行分類（P1-T066）。依字高與 x 位置認行，不只靠欄位序號：
 * 右欄的日期／年資有時會被分到 column 0（x 很大），讀取順序也可能落在同段左欄之後。
 */
import type { DraftField, ExtractedPage, TextLine } from '../../types.ts';

/** 一行加上出處（頁碼、該頁閱讀順序的行號）。 */
export interface Located {
  line: TextLine;
  pageNumber: number;
  lineIndex: number;
  /** 從合併行拆出的右欄日期／年資：指向同一行拆下來的主體（例如職稱） */
  splitOf?: Located;
}

export const BAND = {
  /** 姓名（頁首大字，約 14.1） */
  nameMin: 13,
  /** 段落標題與經歷職稱（約 11.7） */
  headingMin: 11.2,
  headingMax: 12.4,
  /** 小字（職務類別、#標籤、日期，約 9.4）上限 */
  smallMax: 10,
};

/** 段落標題的 x 上限（約 23）；經歷職稱 x 約 68。 */
const HEADING_MAX_X = 40;
const ENTRY_X: readonly [number, number] = [50, 100];

export const isHeadingBand = (l: TextLine): boolean =>
  l.height >= BAND.headingMin && l.height < BAND.headingMax;
export const isSmall = (l: TextLine): boolean => l.height < BAND.smallMax;
export const isBody = (l: TextLine): boolean => !isSmall(l) && l.height < BAND.headingMin;

/** 段落標題：靠左、標題字高、短、沒有 Tab。 */
export function isSectionHeading(l: TextLine): boolean {
  return isHeadingBand(l) && l.x < HEADING_MAX_X && !l.text.includes('\t') && l.text.length <= 12;
}

/** 經歷職稱行：標題字高、x 約 68。 */
export function isEntryTitle(l: TextLine): boolean {
  return isHeadingBand(l) && l.x >= ENTRY_X[0] && l.x <= ENTRY_X[1] && l.text !== '';
}

const RANGE_104 =
  /^((?:19|20)\d{2}\/\d{1,2})\s*[~～]\s*(?:((?:19|20)\d{2}\/\d{1,2})|(仍在職|至今))$/u;
const TENURE = /^(?=\d)(?:\d+年)?(?:\d+個月)?$/u;

export interface DateRange {
  start: string;
  /** null＝仍在職 */
  end: string | null;
}

export function parseRange(text: string): DateRange | null {
  const m = RANGE_104.exec(text.trim());
  if (!m?.[1]) return null;
  return { start: m[1], end: m[3] ? null : (m[2] ?? null) };
}

const segmentsOf = (text: string): string[] =>
  text
    .split('\t')
    .map((s) => s.trim())
    .filter((s) => s !== '');

/**
 * 右欄的日期／年資行：每段都是日期區間、年資，或單一字元（圖示），至少一段是日期或年資。
 * 回傳其中的日期區間；不是這種行回傳 null。
 */
export function metaRanges(text: string): DateRange[] | null {
  const parts = segmentsOf(text);
  const ranges: DateRange[] = [];
  let meaningful = false;
  for (const part of parts) {
    const range = parseRange(part);
    if (range) ranges.push(range);
    if (range || TENURE.test(part)) meaningful = true;
    else if ([...part].length > 1) return null;
  }
  return meaningful ? ranges : null;
}

const isMetaSegment = (part: string): boolean => parseRange(part) !== null || TENURE.test(part);

/**
 * 右欄字少時 layoutPage 會退回單欄，產生「職稱⇥日期」「公司⇥年資」的合併行。
 * 把行尾 Tab 後的日期／年資拆成另一行（指回主體），主體照常分類。
 */
export function splitMerged(at: Located): Located[] {
  // 整行本身就是日期／年資行（可含單字圖示）就不拆。
  if (metaRanges(at.line.text)) return [at];
  const parts = at.line.text.split('\t').map((s) => s.trim());
  let cut = parts.length;
  while (cut > 0 && isMetaSegment(parts[cut - 1] ?? '')) cut -= 1;
  const lead = parts.slice(0, cut).filter((s) => s !== '');
  if (cut === parts.length || lead.length === 0) return [at];
  const main: Located = { ...at, line: { ...at.line, text: lead.join('\t') } };
  const side: Located = {
    ...at,
    line: { ...at.line, text: parts.slice(cut).join('\t'), x: at.line.x + at.line.width },
    splitOf: main,
  };
  return [main, side];
}

/** 依版面由上到下（行頂）、由左到右排序；頁序不變。 */
export function sortedLines(pages: readonly ExtractedPage[]): Located[] {
  return pages.flatMap((page) =>
    page.lines
      .map((line, lineIndex) => ({ line, pageNumber: page.pageNumber, lineIndex }))
      .sort((a, b) => b.line.y + b.line.height - (a.line.y + a.line.height) || a.line.x - b.line.x),
  );
}

export function fieldAt(value: string, at: Located): DraftField {
  return {
    value,
    status: 'unconfirmed',
    source: { pageNumber: at.pageNumber, lineIndex: at.lineIndex },
  };
}

/** 接回被換行切開的一句：兩邊都是英數時補空白，中文直接相接。 */
export function joinWrapped(head: string, tail: string): string {
  const a = head.trimEnd();
  const b = tail.trimStart();
  if (a === '') return b;
  return /[A-Za-z0-9.,;:!?)]$/u.test(a) && /^[A-Za-z0-9(]/u.test(b) ? `${a} ${b}` : `${a}${b}`;
}

/** 行內 Tab 換成空白（給人看的值）。 */
export const plain = (text: string): string => text.replace(/\t+/gu, ' ').trim();

/** 從 `#標籤` 行切出標籤（去 #）。只有行首或空白後的 # 算標籤開頭（`C#`、`C#.NET` 不切）。 */
export function tagsIn(text: string): string[] {
  return plain(text)
    .split(/(?:^|\s)#/u)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}
