/**
 * 單一片段過大時再分段：切成每段估算值都不超過上限的區段，保留原文位置。
 * 優先在換行、句末標點、空白處切；這些斷點都太前面（不到該段一半）才硬切。
 * 不會切開代理對（surrogate pair）。
 */
import { addCodePoint, EMPTY_TALLY, tallyTokens, type TokenTally } from './estimate.ts';

/** 半開區間 [start, end)，單位是 JS 字串索引（UTF-16 code unit）。 */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

const SENTENCE_END = new Set(['。', '！', '？', '；', '.', '!', '?', ';']);

/** 斷點優先序：數字越小越好；null 表示不是斷點。 */
function breakRank(ch: string): number | null {
  if (ch === '\n') return 0;
  if (SENTENCE_END.has(ch)) return 1;
  if (/\s/u.test(ch)) return 2;
  return null;
}

function pickCut(start: number, hardEnd: number, breaks: readonly number[]): number {
  const half = start + (hardEnd - start) / 2;
  for (const pos of breaks) {
    if (pos > start && pos >= half) return pos;
  }
  return hardEnd;
}

/**
 * 把文字切成每段估算值 ≤ maxTokens 的區段。
 * 單一碼位就超過上限時無法切，回傳 null。空字串回傳空陣列。
 */
export function splitByTokens(text: string, maxTokens: number): TextRange[] | null {
  const ranges: TextRange[] = [];
  let start = 0;
  let i = 0;
  let tally: TokenTally = EMPTY_TALLY;
  // 依優先序記錄目前區段內最後一個斷點（斷點位置＝該字元之後）。
  let breaks: number[] = [-1, -1, -1];

  while (i < text.length) {
    const cp = text.codePointAt(i) ?? 0;
    const width = cp > 0xffff ? 2 : 1;
    const next = addCodePoint(tally, cp);

    if (tallyTokens(next) > maxTokens) {
      if (i === start) return null;
      const cut = pickCut(start, i, breaks);
      ranges.push({ start, end: cut });
      start = cut;
      i = cut;
      tally = EMPTY_TALLY;
      breaks = [-1, -1, -1];
      continue;
    }

    tally = next;
    i += width;
    const rank = breakRank(text.slice(i - width, i));
    if (rank !== null) breaks[rank] = i;
  }

  if (i > start) ranges.push({ start, end: i });
  return ranges;
}
