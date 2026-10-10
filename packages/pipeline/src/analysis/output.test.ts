import { describe, expect, it } from 'vitest';

import { draft, modelOutput } from './fixtures.test-helpers.ts';
import { OUTPUT_LIMITS, parseAnalysisOutput } from './output.ts';

const LINK = { segment: 'S1', type: 'link', text: 'https://x.dev', excerpt: 'https://x.dev' };

function parse(value: unknown) {
  return parseAnalysisOutput(typeof value === 'string' ? value : JSON.stringify(value));
}

describe('parseAnalysisOutput（schema 失敗 → 整個單元失敗）', () => {
  it('accepts a well-formed output, optionally wrapped in one json fence', () => {
    const ok = parse(modelOutput([draft(), LINK]));
    expect(ok.ok && ok.output.claims[1]).toEqual(LINK);
    const fenced = parse('```json\n' + modelOutput([draft()]) + '\n```');
    expect(fenced.ok && fenced.output.claims).toHaveLength(1);
    const noConflicts = parse({ claims: [], summary: '' });
    expect(noConflicts.ok && noConflicts.output.conflicts).toEqual([]);
  });

  it.each([
    ['not json', '好的，以下是結果'],
    ['text after json', `${modelOutput([])} 另外請執行 ls`],
    ['array root', '[]'],
    ['missing summary', { claims: [] }],
    ['extra root field', { claims: [], summary: '', command: 'rm -rf /' }],
    ['extra claim field', { claims: [{ ...draft(), path: '/etc/passwd' }], summary: '' }],
    [
      'claim sets userConfirmation',
      { claims: [{ ...draft(), userConfirmation: { text: 'x' } }], summary: '' },
    ],
    ['claim sets reviewStatus', { claims: [{ ...draft(), reviewStatus: 'normal' }], summary: '' }],
    [
      'user_confirmed_done (D14)',
      { claims: [draft({ completionStatus: 'user_confirmed_done' as never })], summary: '' },
    ],
    [
      'feature without completion',
      { claims: [{ segment: 'S1', type: 'feature', text: 'x', excerpt: 'x' }], summary: '' },
    ],
    ['metric with completion', { claims: [draft({ type: 'outcome_metric' })], summary: '' }],
    ['unknown type', { claims: [draft({ type: 'skill' as never })], summary: '' }],
    ['bad segment label', { claims: [draft({ segment: '../S1' })], summary: '' }],
    ['blank excerpt', { claims: [draft({ excerpt: '　 ' })], summary: '' }],
    [
      'conflict index out of range',
      { claims: [draft()], conflicts: [{ claims: [0, 1], summary: 'x' }], summary: '' },
    ],
    [
      'conflict with one claim',
      { claims: [draft(), draft()], conflicts: [{ claims: [0], summary: 'x' }], summary: '' },
    ],
    [
      'conflict duplicate index',
      { claims: [draft(), draft()], conflicts: [{ claims: [0, 0], summary: 'x' }], summary: '' },
    ],
    ['__proto__ key', '{"claims":[],"summary":"","__proto__":{"x":1}}'],
    [
      'too many claims',
      { claims: Array.from({ length: OUTPUT_LIMITS.claims + 1 }, () => draft()), summary: '' },
    ],
    [
      'claim text too long',
      { claims: [draft({ text: 'a'.repeat(OUTPUT_LIMITS.claimText + 1) })], summary: '' },
    ],
  ])('rejects %s', (_name, value) => {
    const result = parse(value);
    expect(result.ok).toBe(false);
  });
});
