/**
 * 104 經歷的右欄日期歸段（P1-T066）。日期行的基線常比職稱高 1～3pt，
 * 靠排序歸段會整排錯位一格；所以先用幾何綁到同一列的職稱，都對不上才退回排序。
 */
import type { StructuredExperience } from '../../types.ts';
import { type DateRange, fieldAt, type Located } from './lines.ts';

/** 日期至少要在職稱右邊這麼遠（point）才算右欄。 */
const RIGHT_OF_TITLE = 150;

export interface DatedEntry {
  title: Located;
  ranges: { range: DateRange; at: Located }[];
}

export interface PendingMeta {
  at: Located;
  ranges: DateRange[];
  /** 排序上的前一段（退回用） */
  previous: DatedEntry | null;
}

/** 同頁、基線差小於職稱字高、在職稱右側（或從同一行拆出）的職稱；取基線最近者。 */
function geometricEntry<E extends DatedEntry>(meta: Located, entries: readonly E[]): E | null {
  let best: E | null = null;
  let bestGap = Infinity;
  for (const entry of entries) {
    if (meta.splitOf) {
      if (meta.splitOf === entry.title) return entry;
      continue;
    }
    const title = entry.title;
    if (title.pageNumber !== meta.pageNumber) continue;
    const gap = Math.abs(meta.line.y - title.line.y);
    const onRight = meta.line.x > title.line.x + RIGHT_OF_TITLE;
    if (onRight && gap < title.line.height && gap < bestGap) {
      best = entry;
      bestGap = gap;
    }
  }
  return best;
}

/** 這行在該段職稱之下（或之後的頁）才可退回歸到該段。 */
function below(meta: Located, title: Located): boolean {
  if (meta.pageNumber !== title.pageNumber) return meta.pageNumber > title.pageNumber;
  return meta.line.y < title.line.y + title.line.height;
}

/** 把日期行歸段；回傳是否有日期是用幾何（右欄）綁上的。 */
export function bindDates(
  pending: readonly PendingMeta[],
  entries: readonly DatedEntry[],
): boolean {
  let onRight = false;
  for (const meta of pending) {
    if (meta.ranges.length === 0) continue;
    const geometric = geometricEntry(meta.at, entries);
    if (geometric) onRight = true;
    const fallback = meta.previous && below(meta.at, meta.previous.title) ? meta.previous : null;
    const entry = geometric ?? fallback;
    entry?.ranges.push(...meta.ranges.map((range) => ({ range, at: meta.at })));
  }
  return onRight;
}

const yearMonth = (value: string): number => {
  const [year, month] = value.split('/');
  return Number(year) * 100 + Number(month);
};

/** 一段裡有多個日期區間時：開始取最早、結束取最晚（任一段仍在職就是仍在職）。 */
export function datesOf(
  entry: DatedEntry,
): Pick<StructuredExperience, 'startDate' | 'endDate' | 'current'> {
  if (entry.ranges.length === 0) return { startDate: null, endDate: null, current: false };
  const first = entry.ranges.reduce((a, b) =>
    yearMonth(b.range.start) < yearMonth(a.range.start) ? b : a,
  );
  const startDate = fieldAt(first.range.start, first.at);
  if (entry.ranges.some((r) => r.range.end === null)) {
    return { startDate, endDate: null, current: true };
  }
  const last = entry.ranges.reduce((a, b) =>
    yearMonth(b.range.end ?? '') > yearMonth(a.range.end ?? '') ? b : a,
  );
  return { startDate, endDate: fieldAt(last.range.end ?? '', last.at), current: false };
}
