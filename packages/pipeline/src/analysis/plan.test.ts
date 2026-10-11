import type { Claim } from '@rolecraft/contracts';
import { createSourceExcerpt, estimateTokens, normalizeText } from '@rolecraft/domain';
import { describe, expect, it } from 'vitest';

import { promptSkeleton } from '../prompts/analysis-prompt.ts';
import { budget, doc, idSource } from './fixtures.test-helpers.ts';
import { planAnalysis, type PlanAnalysisInput } from './plan.ts';
import { prepareUnit } from './prepare.ts';
import { globalSummaryTokenBound } from './summary.ts';
import type { AnalysisDocument } from './types.ts';

function input(overrides: Partial<PlanAnalysisInput> = {}): PlanAnalysisInput {
  return {
    documents: [],
    deletedDocumentIds: [],
    analyzed: [],
    existingClaims: [],
    globalSummary: [],
    budget: budget(100_000),
    newId: idSource(),
    ...overrides,
  };
}

function claimFrom(id: string, source: AnalysisDocument, excerptText: string): Claim {
  const created = createSourceExcerpt(source.document, source.text, excerptText);
  if (!created.ok) throw new Error(created.reason);
  return {
    id,
    type: 'feature',
    text: excerptText,
    completionStatus: 'documented_done',
    basis: { sourceExcerpts: [created.excerpt], userConfirmation: null },
    reviewStatus: 'normal',
  };
}

const analyzed = (d: AnalysisDocument) => ({
  sourceDocumentId: d.document.id,
  contentVersion: d.document.contentVersion,
  contentHash: d.document.contentHash,
});

describe('planAnalysis（增量、R2、R8）', () => {
  it('only analyzes new or changed authorized documents (D5, R2)', () => {
    const fresh = doc('new', '新文件');
    const same = doc('same', '沒變');
    const changedOld = doc('chg', '舊內容');
    const changed = doc('chg', '新內容', { contentVersion: 2, contentHash: 'hash-chg-2' });
    const pending = doc('pending', '待確認', { authorizationStatus: 'pending' });
    const revoked = doc('revoked', '已撤銷', { authorizationStatus: 'revoked' });
    const empty = doc('empty', ' \n　\n');
    const result = planAnalysis(
      input({
        documents: [fresh, same, changed, pending, revoked, empty],
        analyzed: [analyzed(same), analyzed(changedOld)],
      }),
    );
    expect(result.ok && result.documentsToAnalyze).toEqual(['new', 'chg']);
    expect(result.ok && result.emptyDocuments.map((e) => e.sourceDocumentId)).toEqual(['empty']);
    const prompts = JSON.stringify(result.ok && result.plan);
    expect(prompts).not.toContain('待確認');
  });

  it('applies R2 to existing claims: rebase unchanged, review changed, mark removed', () => {
    const v1 = doc('d', '# A\n\n完成登入。\n\n完成匯出。');
    const v2 = doc('d', '# A\n\n完成登入。\n\n完成匯出（先前記載有誤）。', {
      contentVersion: 2,
      contentHash: 'hash-d-2',
    });
    const gone = doc('gone', '完成搜尋。');
    const keep = claimFrom('keep', v1, '完成登入。');
    const changed = claimFrom('changed', v1, '完成匯出');
    const removed = claimFrom('removed', gone, '完成搜尋。');
    const result = planAnalysis(
      input({
        documents: [v2],
        deletedDocumentIds: ['gone'],
        analyzed: [analyzed(v1), analyzed(gone)],
        existingClaims: [keep, changed, removed],
      }),
    );
    if (!result.ok) throw new Error('plan failed');
    const byId = new Map(result.claimUpdates.map((c) => [c.id, c]));
    expect(byId.get('keep')?.reviewStatus).toBe('normal');
    expect(byId.get('keep')?.basis.sourceExcerpts[0]?.contentVersion).toBe(2);
    expect(byId.get('changed')?.reviewStatus).toBe('needs_review');
    expect(byId.get('changed')?.basis.sourceExcerpts[0]?.contentVersion).toBe(1);
    expect(byId.get('removed')?.reviewStatus).toBe('source_removed');
    expect(result.documentsToAnalyze).toEqual(['d']);
  });

  it('splits a long document into units that each fit the budget (R8)', async () => {
    const paragraphs = Array.from(
      { length: 60 },
      (_, i) => `第 ${String(i)} 段：完成功能 ${String(i)}。`,
    );
    const long = doc('long', paragraphs.join('\n\n'));
    const summary = [{ sourceDocumentId: 'long', label: 'long.md', text: '摘要' }];
    const fixed =
      estimateTokens(promptSkeleton('', 'long.md')) + globalSummaryTokenBound(summary) + 60;
    const small = budget(fixed + Math.ceil(estimateTokens(long.text) / 3));
    const newId = idSource();
    const result = planAnalysis(
      input({ documents: [long], budget: small, newId, globalSummary: summary }),
    );
    if (!result.ok || !result.plan) throw new Error('plan failed');
    const { units } = result.plan;
    expect(units.length).toBeGreaterThan(1);
    // 片段依序覆蓋全文、不重疊
    const text = normalizeText(long.text);
    const covered = units
      .flatMap((u) => u.segments.map((s) => text.slice(s.start, s.end)))
      .join('');
    expect(covered.replace(/\s/gu, '')).toBe(text.replace(/\s/gu, ''));
    for (const unit of units) {
      expect(unit.estimatedTokens).toBeLessThanOrEqual(small.available);
      expect(unit.budget).toEqual(small);
      const prepared = await prepareUnit(unit, summary, () => Promise.resolve(long), newId);
      expect(prepared.ok && prepared.estimatedTokens).toBeLessThanOrEqual(small.available);
    }
  });

  it('fails instead of planning when even the fixed prompt exceeds the budget', () => {
    const result = planAnalysis(input({ documents: [doc('d', '內容')], budget: budget(500) }));
    expect(result).toEqual({
      ok: false,
      reason: 'fixed_exceeds_budget',
      sourceDocumentId: 'd',
      claimUpdates: [],
    });
  });

  it('keeps R2 claim updates even when the budget check fails', () => {
    const v1 = doc('d', '# A\n\n完成匯出。');
    const v2 = doc('d', '# A\n\n完成匯出（有誤）。', {
      contentVersion: 2,
      contentHash: 'hash-d-2',
    });
    const gone = doc('gone', '完成搜尋。');
    const changed = claimFrom('changed', v1, '完成匯出');
    const removed = claimFrom('removed', gone, '完成搜尋。');
    const result = planAnalysis(
      input({
        documents: [v2],
        deletedDocumentIds: ['gone'],
        analyzed: [analyzed(v1), analyzed(gone)],
        existingClaims: [changed, removed],
        budget: budget(500),
      }),
    );
    if (result.ok) throw new Error('expected budget failure');
    const byId = new Map(result.claimUpdates.map((c) => [c.id, c.reviewStatus]));
    expect(byId.get('changed')).toBe('needs_review');
    expect(byId.get('removed')).toBe('source_removed');
  });

  it('does not reanalyze a document already analyzed at its current version (R2)', () => {
    const v1 = doc('d', '# A\n\n完成匯出。');
    const v2 = doc('d', '# A\n\n完成匯出（有誤）。', {
      contentVersion: 2,
      contentHash: 'hash-d-2',
    });
    // 綁 v1 的待複核事實項還在，但 v2 已分析過
    const stale = { ...claimFrom('stale', v1, '完成匯出'), reviewStatus: 'needs_review' as const };
    const result = planAnalysis(
      input({ documents: [v2], analyzed: [analyzed(v2)], existingClaims: [stale] }),
    );
    expect(result.ok && result.documentsToAnalyze).toEqual([]);
    expect(result.ok && result.plan).toBeNull();
  });

  it('restores claims on re-authorization with the same hash, without reanalysis (#15)', () => {
    const authorized = doc('d', '# A\n\n完成匯出。');
    const revoked = doc('d', '# A\n\n完成匯出。', { authorizationStatus: 'revoked' });
    const claim = claimFrom('c', authorized, '完成匯出。');
    const base = { analyzed: [analyzed(authorized)] };

    const first = planAnalysis(input({ ...base, documents: [revoked], existingClaims: [claim] }));
    if (!first.ok) throw new Error('plan failed');
    const [held] = first.claimUpdates;
    expect(held?.reviewStatus).toBe('source_removed');
    expect(held?.revocationHold?.previousStatus).toBe('normal');
    if (!held) throw new Error('missing update');

    const back = planAnalysis(input({ ...base, documents: [authorized], existingClaims: [held] }));
    expect(back.ok && back.claimUpdates).toEqual([claim]);
    expect(back.ok && back.documentsToAnalyze).toEqual([]);
    expect(back.ok && back.plan).toBeNull();
  });

  it('does not restore when the hash changed during revocation (#15)', () => {
    const authorized = doc('d', '# A\n\n完成匯出。\n\n其他。');
    const revoked = doc('d', '# A\n\n完成匯出。\n\n其他。', { authorizationStatus: 'revoked' });
    const changed = doc('d', '# A\n\n完成匯出。\n\n其他（新）。', {
      contentVersion: 2,
      contentHash: 'hash-d-2',
    });
    const claim = claimFrom('c', authorized, '完成匯出。');
    const first = planAnalysis(
      input({ documents: [revoked], analyzed: [analyzed(authorized)], existingClaims: [claim] }),
    );
    const held = first.ok ? first.claimUpdates[0] : undefined;
    if (!held) throw new Error('missing update');
    const back = planAnalysis(
      input({ documents: [changed], analyzed: [analyzed(authorized)], existingClaims: [held] }),
    );
    const update = back.ok ? back.claimUpdates[0] : undefined;
    expect(update?.reviewStatus).toBe('source_removed');
    expect(update?.revocationHold).toBeUndefined();
    expect(back.ok && back.documentsToAnalyze).toEqual(['d']);
  });

  it('returns no plan when nothing changed', () => {
    const same = doc('same', '沒變');
    const result = planAnalysis(input({ documents: [same], analyzed: [analyzed(same)] }));
    expect(result.ok && result.plan).toBeNull();
  });
});
