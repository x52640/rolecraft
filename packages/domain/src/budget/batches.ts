/**
 * R8 拆批：把來源片段清單拆成不超預算的批次，保留來源位置。
 *
 * 每批估算值 ＝ 固定內容（指令、全域履歷摘要、歷史內容）
 *            ＋ Σ（片段估算值 ＋ 每片段包裝預留 {@link SEGMENT_OVERHEAD_TOKENS}）。
 * 因估算器對串接次可加，逐片段加總不會低估整批串接後的估算值。
 * 片段順序維持輸入順序；空文字片段略過。
 */
import { estimateTokens } from './estimate.ts';
import { fitsBudget, type InputBudget } from './formula.ts';
import { splitByTokens } from './segment.ts';

/** 每個片段的包裝預留（分隔線、來源標註等組裝時加上的文字）。 */
export const SEGMENT_OVERHEAD_TOKENS = 16;

export interface SourcePiece {
  /** 來源識別（例如 SourceDocument id）。 */
  readonly sourceId: string;
  readonly text: string;
  /** text 在來源原文中的起點（UTF-16 code unit），預設 0。 */
  readonly offset?: number;
}

export interface BatchSegment {
  readonly sourceId: string;
  /** 在來源原文中的半開區間 [start, end)，單位 UTF-16 code unit。 */
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly estimatedTokens: number;
  /** 是否由過大片段再分段而來。 */
  readonly split: boolean;
}

export interface Batch {
  readonly segments: readonly BatchSegment[];
  /** 整批（含固定內容與包裝預留）的估算值。 */
  readonly estimatedTokens: number;
  /** 所用的預算（含上下文上限與各項預留），供每批記錄。 */
  readonly budget: InputBudget;
}

export interface PlanBatchesInput {
  readonly budget: InputBudget;
  /** 每批都要帶的固定內容：指令、全域履歷摘要、歷史內容。 */
  readonly fixed: readonly string[];
  readonly pieces: readonly SourcePiece[];
}

export type PlanBatchesResult =
  | { readonly ok: true; readonly batches: readonly Batch[] }
  | {
      readonly ok: false;
      /** fixed_exceeds_budget：固定內容加一個片段的包裝就超預算；budget_too_small：單一字元都放不下。 */
      readonly reason: 'fixed_exceeds_budget' | 'budget_too_small';
    };

function toSegments(piece: SourcePiece, maxSegmentTokens: number): BatchSegment[] | null {
  const base = piece.offset ?? 0;
  const whole = estimateTokens(piece.text);
  if (whole <= maxSegmentTokens) {
    return [
      {
        sourceId: piece.sourceId,
        start: base,
        end: base + piece.text.length,
        text: piece.text,
        estimatedTokens: whole,
        split: false,
      },
    ];
  }
  const ranges = splitByTokens(piece.text, maxSegmentTokens);
  if (ranges === null) return null;
  return ranges.map((r) => {
    const text = piece.text.slice(r.start, r.end);
    return {
      sourceId: piece.sourceId,
      start: base + r.start,
      end: base + r.end,
      text,
      estimatedTokens: estimateTokens(text),
      split: true,
    };
  });
}

/** 依預算把片段拆批；任何一批都不會超過預算，做不到就回傳失敗而不是送出。 */
export function planBatches(input: PlanBatchesInput): PlanBatchesResult {
  const { budget, fixed, pieces } = input;
  const fixedTokens = fixed.reduce((sum, text) => sum + estimateTokens(text), 0);
  const maxSegmentTokens = budget.available - fixedTokens - SEGMENT_OVERHEAD_TOKENS;
  if (maxSegmentTokens <= 0) return { ok: false, reason: 'fixed_exceeds_budget' };

  const segments: BatchSegment[] = [];
  for (const piece of pieces) {
    if (piece.text.length === 0) continue;
    const parts = toSegments(piece, maxSegmentTokens);
    if (parts === null) return { ok: false, reason: 'budget_too_small' };
    // 逐一 push：展開極大陣列會超過參數上限（RangeError）
    for (const part of parts) segments.push(part);
  }

  const batches: Batch[] = [];
  let current: BatchSegment[] = [];
  let currentTokens = fixedTokens;
  for (const seg of segments) {
    const cost = seg.estimatedTokens + SEGMENT_OVERHEAD_TOKENS;
    if (current.length > 0 && !fitsBudget(currentTokens + cost, budget)) {
      batches.push({ segments: current, estimatedTokens: currentTokens, budget });
      current = [];
      currentTokens = fixedTokens;
    }
    current.push(seg);
    currentTokens += cost;
  }
  if (current.length > 0) {
    batches.push({ segments: current, estimatedTokens: currentTokens, budget });
  }
  return { ok: true, batches };
}
