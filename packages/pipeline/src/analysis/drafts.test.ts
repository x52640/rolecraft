import type { Claim } from '@rolecraft/contracts';
import { checkExcerpt } from '@rolecraft/domain';
import { describe, expect, it } from 'vitest';

import { convertDrafts, type DraftContext } from './drafts.ts';
import { budget, doc, draft, idSource } from './fixtures.test-helpers.ts';
import type { AnalysisOutput, AnalysisUnitSpec, ClaimDraft } from './types.ts';

const TEXT = [
  '# 專案 A',
  '',
  '完成登入功能，2024 年上線。',
  '',
  '計畫中：匯出 PDF。',
  '',
  '使用者 1,200 人。網站 https://a.example.com 已公開。',
  '',
  '重複句。',
  '',
  '重複句。',
].join('\n');

const SOURCE = doc('d1', TEXT);
const SPLIT = TEXT.indexOf('使用者');

function context(overrides: Partial<DraftContext> = {}): DraftContext {
  const unit: AnalysisUnitSpec = {
    unitId: 'u1',
    sourceDocumentId: 'd1',
    contentVersion: 1,
    contentHash: SOURCE.document.contentHash,
    segments: [
      { start: 0, end: SPLIT, estimatedTokens: 1, split: true },
      { start: SPLIT, end: TEXT.length, estimatedTokens: 1, split: true },
    ],
    estimatedTokens: 2,
    budget: budget(1000),
  };
  return {
    unit,
    document: SOURCE.document,
    normalizedText: TEXT,
    existingClaims: [],
    newId: idSource('c'),
    ...overrides,
  };
}

function convert(claims: readonly ClaimDraft[], conflicts: AnalysisOutput['conflicts'] = []) {
  return convertDrafts({ claims, conflicts, summary: '' }, context());
}

describe('convertDrafts（R1：每個事實項都有可驗證的來源片段）', () => {
  it('builds claims whose excerpt location really exists in the source document', () => {
    const result = convert([
      draft({ text: '登入功能，2024 年上線', excerpt: '完成登入功能，2024 年上線。' }),
    ]);
    expect(result.dropped).toEqual([]);
    const [claim] = result.claims;
    expect(claim?.basis.userConfirmation).toBeNull();
    expect(claim?.reviewStatus).toBe('normal');
    expect(claim?.completionStatus).toBe('documented_done');
    const excerpt = claim?.basis.sourceExcerpts[0];
    expect(excerpt?.location).toMatch(/^tb2:/u);
    expect(excerpt && checkExcerpt(excerpt, { kind: 'present', ...SOURCE }).outcome).toBe(
      'unchanged',
    );
  });

  it('drops drafts whose excerpt is not verbatim in the cited segment', () => {
    const result = convert([
      draft({ excerpt: '完成註冊功能' }), // 不存在
      draft({ segment: 'S2', excerpt: '完成登入功能' }), // 在別的片段
      draft({ segment: 'S3' }), // 片段不存在
      draft({ excerpt: '完成登入功能，2024 年上線。\n\n計畫中' }), // 跨出片段範圍仍在 S1 內 → 可
    ]);
    expect(result.dropped).toEqual([
      { index: 0, reason: 'excerpt_not_in_segment' },
      { index: 1, reason: 'excerpt_not_in_segment' },
      { index: 2, reason: 'unknown_segment' },
    ]);
    expect(result.claims).toHaveLength(1);
  });

  it('requires numbers in claim text to appear in the excerpt', () => {
    const result = convert(
      [
        draft({
          type: 'user_count',
          segment: 'S2',
          text: '使用者 1200 人',
          excerpt: '使用者 1,200 人。',
        }),
        draft({
          type: 'user_count',
          segment: 'S2',
          text: '使用者 5000 人',
          excerpt: '使用者 1,200 人。',
        }),
        draft({
          type: 'outcome_metric',
          segment: 'S2',
          text: '使用者成長數十倍',
          excerpt: '使用者 1,200 人。',
        }),
      ].map(withoutCompletion),
    );
    expect(result.claims.map((c) => c.text)).toEqual(['使用者 1200 人']);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      'number_not_in_excerpt',
      'number_not_in_excerpt',
    ]);
  });

  it('requires a link to equal a complete URL in the excerpt', () => {
    const excerpt = '網站 https://a.example.com 已公開。';
    const link = (text: string): ClaimDraft => ({ segment: 'S2', type: 'link', text, excerpt });
    const result = convert([
      link('https://a.example.com'),
      link('https://evil.example.com'),
      link('https://a.example'), // 截斷
      link('h'), // 單一字元
      link('a'),
      link('網站'), // 非網址文字
      link(' https://a.example.com '), // 前後空白可（通過網址檢查）
    ]);
    expect(result.claims.map((c) => c.text)).toEqual(['https://a.example.com']);
    expect(result.dropped).toEqual([
      ...[1, 2, 3, 4, 5].map((index) => ({ index, reason: 'link_not_in_excerpt' })),
      { index: 6, reason: 'duplicate' }, // 通過網址檢查，只因與第 0 項重複
    ]);
  });

  it('accepts a link written as a Markdown link in the excerpt（P1-T047）', () => {
    const excerpt = '網站 [https://a.example.com](https://a.example.com) 已公開。';
    const md = TEXT.replace('網站 https://a.example.com 已公開。', excerpt);
    const base = context({ normalizedText: md });
    const segments = [
      ...base.unit.segments.slice(0, 1),
      { start: SPLIT, end: md.length, estimatedTokens: 1, split: true },
    ];
    const result = convertDrafts(
      {
        claims: [{ segment: 'S2', type: 'link', text: 'https://a.example.com', excerpt }],
        conflicts: [],
        summary: '',
      },
      { ...base, unit: { ...base.unit, segments } },
    );
    expect(result.dropped).toEqual([]);
    expect(result.claims.map((c) => c.text)).toEqual(['https://a.example.com']);
  });

  it('requires every URL in any claim text to be a complete URL from the excerpt', () => {
    const excerpt = '網站 https://a.example.com 已公開。';
    const feature = (text: string): ClaimDraft => draft({ segment: 'S2', text, excerpt });
    const result = convert([
      feature('公開網站 https://a.example.com。'),
      feature('公開網站 https://a.example.com/admin'),
      feature('公開網站 https://a.exam'),
      feature('公開網站 www.evil.example.com'),
    ]);
    expect(result.claims.map((c) => c.text)).toEqual(['公開網站 https://a.example.com。']);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      'link_not_in_excerpt',
      'link_not_in_excerpt',
      'link_not_in_excerpt',
    ]);
  });

  it('drops an excerpt that occurs in different blocks of the segment (ambiguous)', () => {
    const result = convert([draft({ segment: 'S2', text: '重複句', excerpt: '重複句。' })]);
    // 兩份一字不差的區塊算同一指紋序列，位置記份數，不算歧義
    expect(result.claims).toHaveLength(1);
    const twoBlocks = convertDrafts(
      { claims: [draft({ text: '功能', excerpt: '功能' })], conflicts: [], summary: '' },
      context({ normalizedText: TEXT.replace('計畫中：匯出 PDF。', '計畫中：匯出功能。') }),
    );
    expect(twoBlocks.dropped).toEqual([{ index: 0, reason: 'excerpt_unlocatable' }]);
  });

  it('dedupes within the unit and against existing normal claims only', () => {
    const first = convert([draft(), draft()]);
    expect(first.claims).toHaveLength(1);
    expect(first.dropped).toEqual([{ index: 1, reason: 'duplicate' }]);
    const existing = first.claims[0] as Claim;
    const again = convertDrafts(
      { claims: [draft()], conflicts: [], summary: '' },
      context({ existingClaims: [existing] }),
    );
    expect(again.dropped).toEqual([{ index: 0, reason: 'duplicate' }]);
    const stale = { ...existing, reviewStatus: 'needs_review' as const };
    const fresh = convertDrafts(
      { claims: [draft()], conflicts: [], summary: '' },
      context({ existingClaims: [stale] }),
    );
    expect(fresh.claims).toHaveLength(1);
  });

  it('marks same-document contradictions as source_conflict (only escalates)', () => {
    const result = convert(
      [
        draft({ excerpt: '完成登入功能' }),
        draft({ text: '匯出 PDF', completionStatus: 'planned', excerpt: '計畫中：匯出 PDF。' }),
        draft({ excerpt: '不存在' }),
      ],
      [
        { claims: [0, 1], summary: '一處完成一處計畫' },
        { claims: [0, 2], summary: '只剩一項' },
      ],
    );
    expect(result.claims.map((c) => c.reviewStatus)).toEqual([
      'source_conflict',
      'source_conflict',
    ]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.scope).toBe('same_document');
    expect(result.conflicts[0]?.excerpts).toHaveLength(2);
  });
});

describe('convertDrafts：重複的草稿仍套用同文件矛盾（對抗驗證修正）', () => {
  // 同一文件兩個區塊都有「完成匯出功能。」；B 區塊緊接著更正
  const text = '# A\n\n完成匯出功能。\n\n# B\n\n完成匯出功能。\n\n先前記載有誤，匯出已撤下。';
  const source = doc('d1', text);
  const splitAt = text.indexOf('# B');
  const unitOf = (start: number, end: number): AnalysisUnitSpec => ({
    unitId: `u-${String(start)}`,
    sourceDocumentId: 'd1',
    contentVersion: 1,
    contentHash: source.document.contentHash,
    segments: [{ start, end, estimatedTokens: 1, split: true }],
    estimatedTokens: 1,
    budget: budget(1000),
  });
  const done = draft({ text: '匯出功能', excerpt: '完成匯出功能。' });
  const base = { document: source.document, normalizedText: text, newId: idSource('k') };
  const known = convertDrafts(
    { claims: [done], conflicts: [], summary: '' },
    { ...base, unit: unitOf(0, splitAt), existingClaims: [] },
  ).claims;
  const correction: AnalysisOutput = {
    claims: [
      done,
      draft({
        text: '匯出已撤下',
        completionStatus: 'unknown',
        excerpt: '先前記載有誤，匯出已撤下。',
      }),
    ],
    conflicts: [{ claims: [0, 1], summary: '同文件更正' }],
    summary: '',
  };

  it('escalates the known claim and marks the conflict against it', () => {
    expect(known.map((c) => c.reviewStatus)).toEqual(['normal']);
    const result = convertDrafts(correction, {
      ...base,
      unit: unitOf(splitAt, text.length),
      existingClaims: known,
    });
    expect(result.dropped).toEqual([{ index: 0, reason: 'duplicate' }]);
    expect(result.claims.map((c) => [c.text, c.reviewStatus])).toEqual([
      ['匯出已撤下', 'source_conflict'],
    ]);
    expect(result.claimUpdates.map((c) => [c.id, c.reviewStatus])).toEqual([
      [known[0]?.id, 'source_conflict'],
    ]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.claimIds).toEqual([known[0]?.id, result.claims[0]?.id]);
    expect(result.conflicts[0]?.excerpts).toHaveLength(2);
  });

  it('returns no updates when the duplicate is not part of a conflict', () => {
    const result = convertDrafts(
      { ...correction, conflicts: [] },
      { ...base, unit: unitOf(splitAt, text.length), existingClaims: known },
    );
    expect(result.claimUpdates).toEqual([]);
    expect(result.claims.map((c) => c.reviewStatus)).toEqual(['normal']);
  });
});

function withoutCompletion(d: ClaimDraft): ClaimDraft {
  if (d.type === 'feature' || d.type === 'deliverable') return d;
  return { segment: d.segment, type: d.type, text: d.text, excerpt: d.excerpt };
}
