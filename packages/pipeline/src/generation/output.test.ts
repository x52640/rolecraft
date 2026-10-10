import { describe, expect, it } from 'vitest';

import { output, section } from './fixtures.test-helpers.ts';
import { GENERATION_OUTPUT_LIMITS, parseGenerationOutput } from './output.ts';

describe('parseGenerationOutput', () => {
  it('parses a well-formed output, including a single ```json fence', () => {
    const raw = output([
      section(),
      section({ placement: 'summary', citations: [{ claim: 'C3' }] }),
    ]);
    const parsed = parseGenerationOutput(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.output.sections).toHaveLength(2);
    expect(parsed.output.sections[1]?.citations).toEqual([{ claim: 'C3' }]);
    expect(parseGenerationOutput('```json\n' + raw + '\n```').ok).toBe(true);
  });

  const invalid: [string, string][] = [
    ['not JSON', '好的，以下是履歷'],
    ['text around JSON', `說明\n${output([section()])}`],
    ['array at top level', '[]'],
    ['extra top-level field', JSON.stringify({ matches: [], gaps: [], sections: [], note: 'x' })],
    ['missing sections', JSON.stringify({ matches: [], gaps: [] })],
    ['__proto__ key', '{"matches":[],"gaps":[],"sections":[],"__proto__":{}}'],
    ['extra section field', output([section({ company: '乙公司' })])],
    ['missing rationale', output([{ placement: 'E1', text: 'x', citations: [] }])],
    ['empty text', output([section({ text: '  ' })])],
    ['empty rationale', output([section({ rationale: '' })])],
    ['bad placement', output([section({ placement: 'header' })])],
    ['placement E0', output([section({ placement: 'E0' })])],
    ['claim id instead of label', output([section({ citations: [{ claim: 'claim-doc-done' }] })])],
    [
      'unknown statedCompletion',
      output([section({ citations: [{ claim: 'C1', statedCompletion: 'user_confirmed_done' }] })]),
    ],
    ['extra citation field', output([section({ citations: [{ claim: 'C1', note: 'x' }] })])],
    ['match label invalid', output([section()], [{ requirement: 'x', claims: ['S1'] }])],
    ['gap missing question', output([section()], [], [{ requirement: 'x' }])],
    [
      'too many sections',
      output(Array.from({ length: GENERATION_OUTPUT_LIMITS.sections + 1 }, () => section())),
    ],
    [
      'rationale too long',
      output([section({ rationale: 'x'.repeat(GENERATION_OUTPUT_LIMITS.rationale + 1) })]),
    ],
    [
      'text too long',
      output([section({ text: 'x'.repeat(GENERATION_OUTPUT_LIMITS.sectionText + 1) })]),
    ],
  ];

  it.each(invalid)('rejects the whole output: %s', (_, raw) => {
    expect(parseGenerationOutput(raw).ok).toBe(false);
  });

  it('rejects oversized raw output before parsing', () => {
    expect(parseGenerationOutput(' '.repeat(GENERATION_OUTPUT_LIMITS.rawChars + 1)).ok).toBe(false);
  });
});
