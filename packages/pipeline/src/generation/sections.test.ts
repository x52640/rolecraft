import { ResumeVersion, type Claim } from '@rolecraft/contracts';
import { checkExportReadiness } from '@rolecraft/domain';
import { describe, expect, it } from 'vitest';

import { CLAIMS, T, claim, idSource, output, profile, section } from './fixtures.test-helpers.ts';
import { parseGenerationOutput } from './output.ts';
import { convertGeneration, type SectionConversion } from './sections.ts';
import type { SectionDropReason } from './types.ts';

function convert(raw: string, claims: readonly Claim[] = CLAIMS): SectionConversion {
  const parsed = parseGenerationOutput(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return convertGeneration(parsed.output, {
    jobSnapshotId: 'job-1',
    claims,
    profile: profile(),
    job: { company: '乙公司', title: '資深前端工程師' },
    newId: idSource('c'),
    createdAt: T,
  });
}

/** 第一段（必丟）之外加一段合格的，確認只丟那一段。 */
function dropReason(bad: object, claims?: readonly Claim[]): SectionDropReason | undefined {
  const result = convert(output([bad, section()]), claims);
  if (!result.ok) throw new Error(result.error);
  expect(result.result.resumeVersion.sections).toHaveLength(1);
  return result.result.droppedSections[0]?.reason;
}

const cite = (claim: string, statedCompletion?: string) =>
  statedCompletion ? { claim, statedCompletion } : { claim };

describe('convertGeneration（R1、D14）', () => {
  it('builds a pending, cited ResumeVersion that passes the domain R1 export check', () => {
    const result = convert(
      output([
        section(),
        section({
          placement: 'project',
          text: '完成匯出 PDF，載入時間縮短 40%，示範：https://example.com/demo',
          citations: [cite('C2', 'completed'), cite('C3'), cite('C4')],
        }),
      ]),
    );
    if (!result.ok) throw new Error(result.error);
    const { resumeVersion, placements, matches, gaps } = result.result;
    expect(ResumeVersion.safeParse(resumeVersion).success).toBe(true);
    expect(resumeVersion.jobSnapshotId).toBe('job-1');
    for (const s of resumeVersion.sections) {
      expect(s.origin).toBe('generated');
      expect(s.decision).toBe('pending');
      expect(s.sectionConfirmation).toBeNull();
      expect(s.generatedCitations).toEqual(s.citations);
      expect(s.rationale).toBeTruthy();
    }
    expect(resumeVersion.sections[1]?.citations).toEqual([
      { claimId: 'claim-confirmed', statedCompletion: 'completed' },
      { claimId: 'claim-metric' },
      { claimId: 'claim-link' },
    ]);
    expect(checkExportReadiness({ ...resumeVersion, claims: CLAIMS, profile: null }).ok).toBe(true);
    expect(matches).toEqual([{ requirement: '前端開發', claimIds: ['claim-doc-done'] }]);
    expect(gaps).toHaveLength(1);
    // 經歷的公司、職稱、日期、原文來自 Profile
    expect(placements[0]?.placement).toEqual({
      kind: 'experience',
      experienceIndex: 0,
      company: '甲公司',
      title: '前端工程師',
      startDate: '2021-03',
      endDate: null,
      originalText: '負責網站前端開發。',
    });
    expect(placements[1]?.placement).toEqual({ kind: 'project' });
  });

  const drops: [string, object, SectionDropReason][] = [
    [
      'documented_done written as completed (D14)',
      section({ citations: [cite('C1', 'completed')] }),
      'completion_exceeds_claim',
    ],
    [
      'planned written as in_progress',
      section({ citations: [cite('C5', 'in_progress')] }),
      'completion_exceeds_claim',
    ],
    [
      'feature without stated completion',
      section({ citations: [cite('C1')] }),
      'completion_not_stated',
    ],
    [
      'metric with stated completion',
      section({ citations: [cite('C3', 'planned')] }),
      'completion_not_applicable',
    ],
    [
      'label beyond provided claims',
      section({ citations: [cite('C9', 'planned')] }),
      'unknown_claim',
    ],
    [
      'same claim twice',
      section({ citations: [cite('C1', 'planned'), cite('C1', 'planned')] }),
      'duplicate_citation',
    ],
    ['no citations', section({ citations: [] }), 'no_citation'],
    ['unknown experience', section({ placement: 'E2' }), 'unknown_placement'],
    [
      'number not in cited claims',
      section({ text: '開發登入功能，使用者 3000 人' }),
      'number_not_in_claims',
    ],
    [
      'number from an uncited claim',
      section({ text: '開發登入功能，縮短 40%' }),
      'number_not_in_claims',
    ],
    [
      'truncated link',
      section({ text: '示範 https://example.com/de', citations: [cite('C4')] }),
      'link_not_in_claims',
    ],
    [
      'invented link',
      section({ text: '開發登入功能 www.evil.example', citations: [cite('C1', 'planned')] }),
      'link_not_in_claims',
    ],
    [
      'multiplier 翻倍 (PoC)',
      section({ text: '開發登入功能，效能翻倍', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      'multiplier 減半',
      section({ text: '開發登入功能，成本減半', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      'multiplier doubled',
      section({ text: 'Built login, doubled throughput', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      'multiplier twice as fast',
      section({ text: 'Login is twice as fast', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      'multiplier cut in half',
      section({ text: 'Cut login time in half', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      'multiplier threefold',
      section({ text: '開發登入功能，threefold growth', citations: [cite('C1', 'planned')] }),
      'multiplier_not_in_claims',
    ],
    [
      '中文數字倍數 兩倍（數字檢查先擋）',
      section({ text: '開發登入功能，速度提升兩倍', citations: [cite('C1', 'planned')] }),
      'number_not_in_claims',
    ],
    [
      'bare domain path',
      section({ text: '原始碼 github.com/x', citations: [cite('C4')] }),
      'link_not_in_claims',
    ],
    [
      'bare domain',
      section({ text: '開發登入功能，詳見 evil.com', citations: [cite('C1', 'planned')] }),
      'link_not_in_claims',
    ],
    [
      'email domain',
      section({ text: '聯絡 me@evil.com', citations: [cite('C1', 'planned')] }),
      'link_not_in_claims',
    ],
    [
      'fullwidth scheme',
      section({ text: '示範 ｈｔｔｐｓ://evil.example/x', citations: [cite('C4')] }),
      'link_not_in_claims',
    ],
    [
      'zero-width split url',
      section({ text: '示範 https://exa\u200Bmple.com/de', citations: [cite('C4')] }),
      'link_not_in_claims',
    ],
    [
      'zero-width split domain',
      section({ text: '開發登入功能 evil\u200B.com', citations: [cite('C1', 'planned')] }),
      'link_not_in_claims',
    ],
    [
      'job company',
      section({ text: '開發登入功能，貢獻乙公司', citations: [cite('C1', 'planned')] }),
      'mentions_job_identity',
    ],
    [
      'job title (spaced, fullwidth)',
      section({ text: '適任資深 前端工程師的登入功能', citations: [cite('C1', 'planned')] }),
      'mentions_job_identity',
    ],
  ];

  it.each(drops)('drops only the offending section: %s', (_, bad, reason) => {
    expect(dropReason(bad)).toBe(reason);
  });

  it('drops a completed claim whose confirmation is stale', () => {
    const stale = [
      CLAIMS[0] as Claim,
      claim('claim-confirmed', {
        text: '匯出 PDF 與 Word',
        completionStatus: 'user_confirmed_done',
        basis: { sourceExcerpts: [], userConfirmation: { confirmedAt: T, text: '匯出 PDF' } },
      }),
    ];
    expect(dropReason(section({ citations: [cite('C2', 'completed')] }), stale)).toBe(
      'completion_exceeds_claim',
    );
  });

  it('fails the whole output when no section survives (nothing to write)', () => {
    const result = convert(output([section({ citations: [cite('C1', 'completed')] })]));
    expect(result.ok).toBe(false);
  });

  it('drops matches that cite unknown labels or no evidence', () => {
    const result = convert(
      output(
        [section()],
        [
          { requirement: 'A', claims: ['C1', 'C9'] },
          { requirement: 'B', claims: [] },
          { requirement: 'C', claims: ['C2', 'C2'] },
        ],
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.result.droppedMatches).toEqual([0, 1]);
    expect(result.result.matches).toEqual([{ requirement: 'C', claimIds: ['claim-confirmed'] }]);
  });

  it.each([
    ['multiplier present in the cited claim', '登入時間翻倍縮短', '登入時間翻倍縮短', 'C1'],
    ['file names and versions are not domains', '登入功能（README.md、Node.js）', '登入功能', 'C1'],
    [
      'loose url equal to the cited link',
      '示範 example.com/demo',
      'https://example.com/demo',
      'C4',
    ],
    ['Profile company is not blocked', '在甲公司開發登入功能', '登入功能', 'C1'],
  ])('keeps the section: %s', (_, text, claimText, label) => {
    const claims = CLAIMS.map((c, i) => (i === 0 ? claim(c.id, { text: claimText }) : c));
    const stated = label === 'C1' ? 'planned' : undefined;
    const result = convert(output([section({ text, citations: [cite(label, stated)] })]), claims);
    expect(result.ok).toBe(true);
  });
});
