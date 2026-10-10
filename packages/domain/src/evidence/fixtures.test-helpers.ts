import type { Claim, Profile, ResumeSection } from '@rolecraft/contracts';

export const T = '2026-10-10T10:00:00+08:00';

const excerpt = {
  sourceDocumentId: 'doc-1',
  contentVersion: 1,
  contentHash: 'h1',
  location: 'L1',
  text: '原文',
};

export function feature(id: string, text: string, overrides: Partial<Claim> = {}): Claim {
  return {
    id,
    type: 'feature',
    text,
    completionStatus: 'user_confirmed_done',
    basis: { sourceExcerpts: [excerpt], userConfirmation: { confirmedAt: T, text } },
    reviewStatus: 'normal',
    ...overrides,
  };
}

export function metric(id: string, text: string): Claim {
  return {
    id,
    type: 'outcome_metric',
    text,
    basis: { sourceExcerpts: [excerpt], userConfirmation: null },
    reviewStatus: 'normal',
  };
}

export function section(overrides: Partial<ResumeSection> = {}): ResumeSection {
  return {
    id: 's1',
    origin: 'user_written',
    text: '負責搜尋功能',
    citations: [],
    sectionConfirmation: null,
    ...overrides,
  };
}

export function generated(
  text: string,
  citations: ResumeSection['citations'],
  overrides: Partial<ResumeSection> = {},
): ResumeSection {
  return section({
    origin: 'generated',
    text,
    citations,
    generatedCitations: citations.map((c) => ({ ...c })),
    ...overrides,
  });
}

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    personalInfo: { 姓名: '王小明' },
    experiences: [
      { company: 'ACME', title: '工程師', startDate: '2019-03', endDate: null, description: '' },
    ],
    skills: [],
    pdfParseConfirmed: true,
    ...overrides,
  };
}
