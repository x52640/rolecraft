import type { Claim, WorkExperience } from '@rolecraft/contracts';
import { checkExportReadiness } from '@rolecraft/domain';
import { describe, expect, it } from 'vitest';

import { FALLBACK_RATIONALE } from './experience-fallback.ts';
import {
  CLAIMS,
  T,
  idSource,
  output,
  profile,
  section,
  snapshot,
} from './fixtures.test-helpers.ts';
import { parseGenerationOutput } from './output.ts';
import { GENERATION_INSTRUCTIONS, assembleGenerationPrompt } from './prompt.ts';
import { convertGeneration, type SectionConversion } from './sections.ts';

const EXPERIENCES: WorkExperience[] = [
  {
    company: '丙公司',
    title: '客戶成功經理',
    startDate: '2022-01',
    endDate: null,
    description: '負責 30 家企業客戶的導入與續約，續約率 95%。',
  },
  {
    company: '丁公司',
    title: '業務專員',
    startDate: '2019-05',
    endDate: '2021-12',
    description: '開發新客戶，年度業績達成率 120%。',
  },
  {
    company: '戊公司',
    title: '行政助理',
    startDate: '2018-01',
    endDate: '2019-04',
    description: '   ',
  },
];

const PROFILE = profile({ experiences: EXPERIENCES });

function convert(sections: readonly object[], claims: readonly Claim[] = CLAIMS) {
  const parsed = parseGenerationOutput(output(sections));
  if (!parsed.ok) throw new Error(parsed.error);
  const result: SectionConversion = convertGeneration(parsed.output, {
    jobSnapshotId: 'job-1',
    claims,
    profile: PROFILE,
    job: { company: '乙公司', title: 'AI 客戶成功經理' },
    newId: idSource('c'),
    createdAt: T,
  });
  if (!result.ok) throw new Error(result.error);
  return result.result;
}

const project = section({ placement: 'project' });

describe('經歷段落（P1-T072）', () => {
  it('提示要求每段經歷都輸出、專案只是補充，不再把經歷當成只作背景', () => {
    expect(GENERATION_INSTRUCTIONS).toContain('每一段描述不是空白的既有經歷（E1、E2…）都要輸出');
    expect(GENERATION_INSTRUCTIONS).toContain('專案段落是補充，不能取代經歷段落');
    expect(GENERATION_INSTRUCTIONS).toContain('可以不引用事實項');
    expect(GENERATION_INSTRUCTIONS).not.toContain('只作背景');
  });

  it('經歷段不引用事實項也保留；數字可來自同一段經歷描述', () => {
    const text = '主導 30 家企業客戶導入與續約，續約率 95%';
    const result = convert([section({ placement: 'E1', text, citations: [] }), project]);
    expect(result.droppedSections).toEqual([]);
    const kept = result.resumeVersion.sections[0];
    expect(kept?.text).toBe(text);
    expect(kept?.citations).toEqual([]);
    expect(kept?.generatedCitations).toEqual([]);
    // R1：沒有引用的段落要逐段確認；數字對得到已確認的 Profile，不另報數字問題
    const check = checkExportReadiness({ sections: [kept!], claims: CLAIMS, profile: PROFILE });
    expect(check.issues.map((i) => i.check)).toEqual(['no_citation']);
    expect(check.issues.every((i) => i.resolvableBySectionConfirmation)).toBe(true);
  });

  it('經歷段的數字只認同一段經歷描述，不認其他經歷', () => {
    const result = convert([
      section({ placement: 'E1', text: '續約率 120%', citations: [] }),
      project,
    ]);
    expect(result.droppedSections).toEqual([{ index: 0, reason: 'number_not_in_claims' }]);
  });

  it('經歷段仍不能寫職缺的公司或職稱', () => {
    const result = convert([
      section({ placement: 'E1', text: '具備 AI 客戶成功經理經驗', citations: [] }),
      project,
    ]);
    expect(result.droppedSections).toEqual([{ index: 0, reason: 'mentions_job_identity' }]);
  });

  it('缺經歷段：程式補沿用原文段，空白描述不補，不呼叫模型', () => {
    const result = convert([project]);
    const filled = result.resumeVersion.sections.slice(1);
    expect(result.filledExperiences).toEqual([0, 1]);
    expect(filled.map((s) => s.text)).toEqual([
      EXPERIENCES[0]?.description,
      EXPERIENCES[1]?.description,
    ]);
    for (const s of filled) {
      expect(s.origin).toBe('generated');
      expect(s.decision).toBe('pending');
      expect(s.citations).toEqual([]);
      expect(s.generatedCitations).toEqual([]);
      expect(s.sectionConfirmation).toBeNull();
      expect(s.rationale).toBe(FALLBACK_RATIONALE);
    }
    expect(result.placements.slice(1).map((p) => p.placement)).toMatchObject([
      { kind: 'experience', experienceIndex: 0, company: '丙公司', title: '客戶成功經理' },
      { kind: 'experience', experienceIndex: 1, company: '丁公司', title: '業務專員' },
    ]);
  });

  it('經歷段沒通過檢查被丟掉時也補沿用原文；有改寫的經歷不補', () => {
    const result = convert([
      section({ placement: 'E1', text: '續約率 99%', citations: [] }),
      section({ placement: 'E2', text: '開發新客戶，業績達成率 120%', citations: [] }),
    ]);
    expect(result.droppedSections).toEqual([{ index: 0, reason: 'number_not_in_claims' }]);
    expect(result.filledExperiences).toEqual([0]);
    expect(result.resumeVersion.sections.map((s) => s.text)).toEqual([
      '開發新客戶，業績達成率 120%',
      EXPERIENCES[0]?.description,
    ]);
  });

  it('沒有任何段落通過檢查時整份失敗，不只靠補段產生版本', () => {
    const parsed = parseGenerationOutput(
      output([section({ placement: 'project', citations: [] })]),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    const result = convertGeneration(parsed.output, {
      jobSnapshotId: 'job-1',
      claims: CLAIMS,
      profile: PROFILE,
      job: { company: '乙公司', title: 'AI 客戶成功經理' },
      newId: idSource('c'),
      createdAt: T,
    });
    expect(result.ok).toBe(false);
  });

  it('描述空白的經歷：提示標「不要輸出」且不要求一段不少，不放描述區塊（對抗驗證）', () => {
    expect(GENERATION_INSTRUCTIONS).not.toContain('每一段既有經歷（E1、E2…）都要輸出');
    const prompt = assembleGenerationPrompt(
      { job: snapshot().fields, claims: CLAIMS, experiences: EXPERIENCES },
      idSource('b'),
    );
    expect(prompt).toContain('E3（描述空白：不要輸出）：');
    expect(prompt).not.toContain('E3_DESCRIPTION');
    expect(prompt).toContain('E1_DESCRIPTION');
    expect(prompt).not.toContain('E1（描述空白');
  });

  it('描述空白又沒有引用的經歷段丟棄；有引用事實項的保留（對抗驗證）', () => {
    const blank = convert([
      section({ placement: 'E3', text: '處理行政庶務', citations: [] }),
      project,
    ]);
    expect(blank.droppedSections).toEqual([{ index: 0, reason: 'no_citation' }]);
    expect(blank.resumeVersion.sections.map((s) => s.text)).not.toContain('處理行政庶務');
    const cited = convert([section({ placement: 'E3' }), project]);
    expect(cited.droppedSections).toEqual([]);
  });
});
