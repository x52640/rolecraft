import { describe, expect, it } from 'vitest';

import {
  CLAIMS,
  UNUSABLE,
  budget,
  claim,
  idSource,
  profile,
  snapshot,
} from './fixtures.test-helpers.ts';
import { planGeneration, prepareGeneration, usableClaims } from './prepare.ts';
import type { GenerationInputs, GenerationPlan } from './types.ts';

function plan(available = 200_000): GenerationPlan {
  const result = planGeneration({
    jobSnapshot: snapshot(),
    budget: budget(available),
    newId: idSource('p'),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

const inputs = (overrides: Partial<GenerationInputs> = {}): GenerationInputs => ({
  profile: profile(),
  jobSnapshot: snapshot(),
  claims: [...CLAIMS, ...UNUSABLE],
  ...overrides,
});

const prepare = (p: GenerationPlan, i: GenerationInputs) => prepareGeneration(p, i, idSource('b'));

describe('planGeneration', () => {
  it('requires a confirmed job snapshot (R10)', () => {
    const unconfirmed = snapshot({ confirmedAt: null });
    expect(
      planGeneration({ jobSnapshot: unconfirmed, budget: budget(1), newId: idSource() }),
    ).toEqual({
      ok: false,
      reason: 'snapshot_not_confirmed',
    });
    expect(planGeneration({ jobSnapshot: null, budget: budget(1), newId: idSource() }).ok).toBe(
      false,
    );
  });
});

describe('prepareGeneration', () => {
  it('uses only usable claims, in order (R1, R2)', () => {
    const prepared = prepare(plan(), inputs());
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(prepared.claims.map((c) => c.id)).toEqual(CLAIMS.map((c) => c.id));
    for (const text of ['金流串接', '推播通知', '離線模式']) {
      expect(prepared.prompt).not.toContain(text);
    }
  });

  it('keeps a source-removed claim only when the user confirmed it', () => {
    const removed = claim('r1', { text: '舊功能', reviewStatus: 'source_removed' });
    const kept = claim('r2', {
      text: '舊報表',
      reviewStatus: 'source_removed',
      basis: {
        sourceExcerpts: [],
        userConfirmation: { confirmedAt: snapshot().capturedAt, text: '舊報表' },
      },
    });
    expect(usableClaims([removed, kept]).map((c) => c.id)).toEqual(['r2']);
  });

  it('excludes malformed claims and every claim sharing a duplicated id', () => {
    const dup = claim('claim-doc-done', { text: '另一個登入功能' });
    const ids = usableClaims([...CLAIMS, dup, { id: 'bad' }]).map((c) => c.id);
    expect(ids).not.toContain('claim-doc-done');
    expect(ids).not.toContain('bad');
  });

  it.each([
    ['snapshot_missing', inputs({ jobSnapshot: null })],
    ['snapshot_missing', inputs({ jobSnapshot: snapshot({ id: 'job-2' }) })],
    ['snapshot_not_confirmed', inputs({ jobSnapshot: snapshot({ confirmedAt: null }) })],
    [
      'snapshot_changed',
      inputs({ jobSnapshot: snapshot({ confirmedAt: '2026-10-11T00:00:00.000Z' }) }),
    ],
    ['profile_not_confirmed', inputs({ profile: profile({ pdfParseConfirmed: false }) })],
    ['profile_not_confirmed', inputs({ profile: null })],
    ['no_usable_claims', inputs({ claims: UNUSABLE })],
  ] as const)('does not send: %s', (reason, i) => {
    expect(prepare(plan(), i)).toEqual({ ok: false, reason });
  });

  it('does not send when the prompt exceeds the budget (R8)', () => {
    expect(prepare(plan(100), inputs())).toEqual({ ok: false, reason: 'over_budget' });
  });
});
