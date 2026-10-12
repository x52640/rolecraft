/**
 * 頁首大字姓名（P1-T069）。
 * - 104 實測：頁首大字行 Tab 前那一段可能是「姓名＋空白＋標語第一個詞」（例如「王小明 邏輯清晰」），
 *   第一段是 2～5 個中文字、後面還有空白時只取第一個空白前的部分（英文姓名「John Smith」不切）。
 * - 頁首大字姓名候選：第 1 頁字高最大、且明顯大於內文的第一行。只用來在本機預填姓名、
 *   並在送模型前遮蔽姓名；認不出就回 null，不猜。
 */
import type { DraftField, ExtractedPage } from '../types.ts';
import { headingKind } from './rules.ts';

const MIN_RATIO = 1.25;
const CJK_NAME_THEN_MORE = /^(\p{Script=Han}{2,5})\s+\S/u;

/** 頁首段落 → 姓名：中文姓名後接空白與其他字時只取姓名。 */
export function cleanHeaderName(segment: string): string {
  const text = segment.trim();
  return CJK_NAME_THEN_MORE.exec(text)?.[1] ?? text;
}

const ENGLISH_NAME = /^([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,2})(?=\s|$)/u;

/**
 * 切掉的部分開頭像英文姓名（1～3 個大寫開頭的英文字，例如「林測試 Alex Lin 邏輯清晰」的 Alex Lin）：
 * 回傳它，供送模型前一併遮蔽（P1-T069 對抗驗證）；不像就回 null。
 */
export function headerNameAlias(segment: string): string | null {
  const text = segment.trim();
  const name = CJK_NAME_THEN_MORE.exec(text)?.[1];
  if (!name) return null;
  return ENGLISH_NAME.exec(text.slice(name.length).trim())?.[1] ?? null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function headerNameCandidate(pages: readonly ExtractedPage[]): DraftField | null {
  const page = pages.find((p) => p.lines.length > 0);
  if (!page) return null;
  const heights = page.lines.map((line) => line.height);
  const tallest = Math.max(...heights);
  if (!(tallest >= median(heights) * MIN_RATIO)) return null;
  const lineIndex = page.lines.findIndex((line) => line.height === tallest);
  const text = cleanHeaderName(page.lines[lineIndex]?.text.split('\t')[0] ?? '');
  const length = [...text].length;
  if (length < 2 || length > 20 || /[\d@:：/]/u.test(text) || headingKind(text)) return null;
  return {
    value: text,
    status: 'unconfirmed',
    source: { pageNumber: page.pageNumber, lineIndex },
  };
}
