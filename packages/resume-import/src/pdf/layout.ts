import type { ExtractedPage, RawPage, TextLine, TextRun } from '../types.ts';

/** 雙欄之間的空白帶最少要多寬（point）。 */
const MIN_GUTTER = 12;
/** 空白帶只在頁面寬度的這個區間內找，避免把左右頁邊距當成欄間距。 */
const GUTTER_RANGE: readonly [number, number] = [0.25, 0.75];
/** 左右兩邊各至少要有幾段文字，才算雙欄。 */
const MIN_RUNS_PER_COLUMN = 3;

interface Gutter {
  start: number;
  end: number;
}

function crosses(run: TextRun, gutter: Gutter): boolean {
  return run.x < gutter.end && run.x + run.width > gutter.start;
}

/**
 * 找雙欄的欄間距：頁面中段一條最寬、跨過它的文字最少的直向空白帶。
 * 跨過它的文字（例如頁首姓名）視為跨欄行，最多佔一成。
 */
export function findGutter(runs: readonly TextRun[], pageWidth: number): Gutter | null {
  if (runs.length < MIN_RUNS_PER_COLUMN * 2 || pageWidth <= 0) return null;
  const bins = Math.ceil(pageWidth);
  const coverage = new Array<number>(bins).fill(0);
  for (const run of runs) {
    const from = Math.max(0, Math.floor(run.x));
    const to = Math.min(bins - 1, Math.ceil(run.x + run.width) - 1);
    for (let i = from; i <= to; i += 1) coverage[i] = (coverage[i] ?? 0) + 1;
  }
  const allowed = Math.floor(runs.length * 0.1);
  const lo = Math.floor(pageWidth * GUTTER_RANGE[0]);
  const hi = Math.ceil(pageWidth * GUTTER_RANGE[1]);
  let best: Gutter | null = null;
  let runStart = -1;
  for (let i = lo; i <= hi + 1; i += 1) {
    const open = i <= hi && (coverage[i] ?? 0) <= allowed;
    if (open && runStart < 0) runStart = i;
    if (!open && runStart >= 0) {
      if (!best || i - runStart > best.end - best.start) best = { start: runStart, end: i };
      runStart = -1;
    }
  }
  if (!best || best.end - best.start < MIN_GUTTER) return null;
  const gutter = best;
  const left = runs.filter((r) => !crosses(r, gutter) && r.x + r.width <= gutter.start).length;
  const right = runs.filter((r) => !crosses(r, gutter) && r.x >= gutter.end).length;
  if (left < MIN_RUNS_PER_COLUMN || right < MIN_RUNS_PER_COLUMN) return null;
  return gutter;
}

/** 把同一條基線上的文字段合成一行（由上到下、由左到右）。 */
export function groupLines(
  runs: readonly TextRun[],
  pageNumber: number,
  column: number,
): TextLine[] {
  const sorted = [...runs].sort((p, q) => q.y - p.y || p.x - q.x);
  const groups: TextRun[][] = [];
  for (const run of sorted) {
    const current = groups.at(-1);
    const head = current?.[0];
    const tolerance = Math.max(1, (head?.height ?? run.height) * 0.5);
    if (current && head && Math.abs(head.y - run.y) <= tolerance) current.push(run);
    else groups.push([run]);
  }
  return groups.map((group) => toLine(group, pageNumber, column));
}

function toLine(group: TextRun[], pageNumber: number, column: number): TextLine {
  const parts = [...group].sort((p, q) => p.x - q.x);
  let text = '';
  let cursor = -Infinity;
  for (const part of parts) {
    const gap = part.x - cursor;
    const needsSpace =
      text !== '' && gap > part.height * 0.2 && !text.endsWith(' ') && !part.text.startsWith(' ');
    text += (needsSpace ? ' ' : '') + part.text;
    cursor = Math.max(cursor, part.x + part.width);
  }
  const first = parts[0];
  const x = first?.x ?? 0;
  return {
    pageNumber,
    column,
    text: text.replace(/\s+/g, ' ').trim(),
    x,
    y: first?.y ?? 0,
    width: cursor - x,
    height: Math.max(...parts.map((p) => p.height)),
  };
}

/**
 * 依閱讀順序排一頁的行。雙欄時以跨欄行為分段，每段先左欄再右欄。
 */
export function layoutPage(page: RawPage): ExtractedPage {
  const base = { pageNumber: page.pageNumber, width: page.width, height: page.height };
  const runs = page.runs.filter((r) => !r.rotated);
  const gutter = findGutter(runs, page.width);
  if (!gutter) {
    return { ...base, columns: 1, lines: groupLines(runs, page.pageNumber, 0) };
  }
  // 跨欄行：跨過欄間距的文字，加上和它同一條基線的其他片段（例如頁首被拆開的信箱）。
  const crossing = runs.filter((r) => crosses(r, gutter));
  const onCrossingLine = (r: TextRun): boolean =>
    crossing.some((c) => Math.abs(c.y - r.y) <= Math.max(1, c.height * 0.5));
  const spanning = groupLines(runs.filter(onCrossingLine), page.pageNumber, 0);
  const columnRuns = runs.filter((r) => !onCrossingLine(r));
  // 跨欄行把頁面切成上下數段；段界是跨欄行的 y。
  const breaks = spanning.map((line) => line.y);
  const segmentOf = (y: number): number => breaks.filter((b) => b > y).length;
  const lines: TextLine[] = [];
  for (let segment = 0; segment <= breaks.length; segment += 1) {
    const header = spanning[segment - 1];
    if (header) lines.push(header);
    const inSegment = columnRuns.filter((r) => segmentOf(r.y) === segment);
    const left = inSegment.filter((r) => r.x + r.width <= gutter.start);
    const right = inSegment.filter((r) => r.x >= gutter.end);
    lines.push(...groupLines(left, page.pageNumber, 0), ...groupLines(right, page.pageNumber, 1));
  }
  return { ...base, columns: 2, lines };
}
