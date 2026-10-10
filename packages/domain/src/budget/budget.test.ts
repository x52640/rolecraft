import { describe, expect, it } from 'vitest';

import {
  computeInputBudget,
  estimateTokens,
  fitsBudget,
  planBatches,
  SEGMENT_OVERHEAD_TOKENS,
  splitByTokens,
  type InputBudget,
  type PlanBatchesResult,
} from '../index.ts';

function budgetOf(available: number): InputBudget {
  const result = computeInputBudget({
    contextLimit: available + 300,
    outputReserve: 200,
    toolOverheadReserve: 100,
  });
  if (!result.ok) throw new Error('bad budget');
  return result.budget;
}

function batchesOf(result: PlanBatchesResult) {
  if (!result.ok) throw new Error(`plan failed: ${result.reason}`);
  return result.batches;
}

describe('estimateTokens（保守估算）', () => {
  it('ASCII 每 3 字元 1 token，無條件進位', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(2);
  });

  it('中文每字 2 token、emoji 3 token、2 位元組字 1 token', () => {
    expect(estimateTokens('履歷')).toBe(4);
    expect(estimateTokens('😀')).toBe(3);
    expect(estimateTokens('é')).toBe(1);
    expect(estimateTokens('做 React 開發')).toBe(Math.ceil(7 / 3) + 3 * 2);
  });

  it('串接次可加：整串估算不超過各段估算之和', () => {
    const parts = ['ab', '中文', 'c', '😀x', 'hello world'];
    const sum = parts.reduce((s, p) => s + estimateTokens(p), 0);
    expect(estimateTokens(parts.join(''))).toBeLessThanOrEqual(sum);
  });
});

describe('computeInputBudget（R8 公式）', () => {
  it('預算＝上限－輸出預留－工具開銷預留', () => {
    const r = computeInputBudget({
      contextLimit: 1000,
      outputReserve: 300,
      toolOverheadReserve: 200,
    });
    expect(r).toEqual({
      ok: true,
      budget: { contextLimit: 1000, outputReserve: 300, toolOverheadReserve: 200, available: 500 },
    });
  });

  it('扣完不剩或數值不合法就失敗', () => {
    expect(
      computeInputBudget({ contextLimit: 500, outputReserve: 300, toolOverheadReserve: 200 }),
    ).toEqual({ ok: false, reason: 'non_positive_budget' });
    expect(
      computeInputBudget({ contextLimit: 1.5, outputReserve: 0, toolOverheadReserve: 0 }),
    ).toEqual({ ok: false, reason: 'invalid_number' });
    expect(
      computeInputBudget({ contextLimit: 100, outputReserve: -1, toolOverheadReserve: 0 }),
    ).toEqual({ ok: false, reason: 'invalid_number' });
  });

  it('剛好等於算在內，超過一個 token 不行', () => {
    const b = budgetOf(100);
    expect(fitsBudget(100, b)).toBe(true);
    expect(fitsBudget(101, b)).toBe(false);
  });
});

describe('planBatches 邊界', () => {
  // 'a'.repeat(30) 估 10 token，加包裝 16 → 每片段 26。
  const piece = (id: string) => ({ sourceId: id, text: 'a'.repeat(30) });
  const perPiece = 10 + SEGMENT_OVERHEAD_TOKENS;

  it('剛好等於預算：一批', () => {
    const batches = batchesOf(
      planBatches({
        budget: budgetOf(perPiece * 2),
        fixed: [],
        pieces: [piece('s1'), piece('s2')],
      }),
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]?.estimatedTokens).toBe(perPiece * 2);
  });

  it('超過一個 token：拆成兩批', () => {
    const batches = batchesOf(
      planBatches({
        budget: budgetOf(perPiece * 2 - 1),
        fixed: [],
        pieces: [piece('s1'), piece('s2')],
      }),
    );
    expect(batches.map((b) => b.segments.map((s) => s.sourceId))).toEqual([['s1'], ['s2']]);
  });

  it('固定內容計入每一批', () => {
    const fixed = ['abc'.repeat(5)]; // 5 token
    const batches = batchesOf(
      planBatches({ budget: budgetOf(perPiece + 5), fixed, pieces: [piece('s1'), piece('s2')] }),
    );
    expect(batches).toHaveLength(2);
    for (const b of batches) expect(b.estimatedTokens).toBe(perPiece + 5);
  });

  it('單一片段超過預算：再分段，每批不超預算且位置可還原', () => {
    const text = 'a'.repeat(300); // 100 token
    const budget = budgetOf(52);
    const batches = batchesOf(
      planBatches({ budget, fixed: [], pieces: [{ sourceId: 'big', text, offset: 1000 }] }),
    );
    expect(batches.length).toBeGreaterThan(1);
    const segs = batches.flatMap((b) => b.segments);
    for (const b of batches) expect(b.estimatedTokens).toBeLessThanOrEqual(budget.available);
    expect(segs.every((s) => s.split)).toBe(true);
    expect(segs[0]?.start).toBe(1000);
    expect(segs.at(-1)?.end).toBe(1300);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    for (const s of segs) expect(text.slice(s.start - 1000, s.end - 1000)).toBe(s.text);
  });

  it('每批記錄所用預算與上限', () => {
    const budget = budgetOf(100);
    const [batch] = batchesOf(planBatches({ budget, fixed: [], pieces: [piece('s1')] }));
    expect(batch?.budget).toEqual(budget);
    expect(batch?.segments[0]).toMatchObject({ sourceId: 's1', start: 0, end: 30, split: false });
  });

  it('固定內容就吃光預算：失敗，不產生批次', () => {
    expect(
      planBatches({ budget: budgetOf(20), fixed: ['a'.repeat(12)], pieces: [piece('s1')] }),
    ).toEqual({ ok: false, reason: 'fixed_exceeds_budget' });
  });

  it('單一字元都放不下：失敗', () => {
    // 可用給片段的只有 2 token，emoji 要 3。
    expect(
      planBatches({
        budget: budgetOf(SEGMENT_OVERHEAD_TOKENS + 2),
        fixed: [],
        pieces: [{ sourceId: 'e', text: '😀' }],
      }),
    ).toEqual({ ok: false, reason: 'budget_too_small' });
  });

  it('略過空片段、維持輸入順序', () => {
    const batches = batchesOf(
      planBatches({
        budget: budgetOf(1000),
        fixed: [],
        pieces: [piece('a'), { sourceId: 'empty', text: '' }, piece('b')],
      }),
    );
    expect(batches[0]?.segments.map((s) => s.sourceId)).toEqual(['a', 'b']);
  });

  it('中英混合長文：所有批次都不超預算，文字完整還原', () => {
    const text = '負責後端 API 設計與部署。\n導入 CI/CD，縮短發佈時間 40%！'.repeat(40);
    const budget = budgetOf(200);
    const batches = batchesOf(
      planBatches({ budget, fixed: ['請依職缺改寫履歷段落。'], pieces: [{ sourceId: 'd', text }] }),
    );
    for (const b of batches) expect(b.estimatedTokens).toBeLessThanOrEqual(budget.available);
    expect(
      batches
        .flatMap((b) => b.segments)
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});

describe('splitByTokens', () => {
  it('優先在換行切', () => {
    const text = 'aaaaaa\nbbbbbb';
    // 上限 3 token（9 字元），第一段應停在換行後。
    expect(splitByTokens(text, 3)).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 13 },
    ]);
  });

  it('不切開代理對', () => {
    const ranges = splitByTokens('😀😀😀', 4);
    expect(ranges).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it('空字串回空陣列；單字元超限回 null', () => {
    expect(splitByTokens('', 5)).toEqual([]);
    expect(splitByTokens('中', 1)).toBeNull();
  });
});
