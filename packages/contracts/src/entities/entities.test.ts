import { NonEmptyText } from './common.ts';
import { describe, expect, it } from 'vitest';

import {
  ApplicationRecord,
  Claim,
  ExportVersion,
  JobSnapshot,
  MessageDraft,
  Profile,
  ProjectEvidence,
  ProviderConnection,
  ResumeVersion,
  RunCheckRecord,
  SourceDocument,
  WorkJob,
} from '../index.ts';

const T = '2026-10-10T08:00:00+08:00';

const sourceDocument = {
  id: 'doc-1',
  folderPath: '/Users/me/projects/app',
  documentPath: '/Users/me/projects/app/README.md',
  contentHash: 'abc123',
  contentVersion: 1,
  authorizationStatus: 'authorized',
  importedAt: T,
};

const claim = {
  id: 'claim-1',
  type: 'feature',
  text: '支援 PDF 匯出',
  completionStatus: 'documented_done',
  basis: {
    sourceExcerpts: [
      {
        sourceDocumentId: 'doc-1',
        contentVersion: 1,
        contentHash: 'abc123',
        location: 'L10-L12',
        text: '- [x] PDF 匯出',
      },
    ],
    userConfirmation: null,
  },
  reviewStatus: 'normal',
};

const jobSnapshot = {
  id: 'job-1',
  platform: '104',
  url: 'https://www.104.com.tw/job/abc',
  capturedAt: T,
  captureMethod: 'auto',
  fields: {
    company: '某公司',
    title: '前端工程師',
    description: '負責網站開發',
    responsibilities: { status: 'captured', value: '開發維護' },
    requirements: { status: 'not_provided' },
    preferredQualifications: { status: 'not_captured' },
    location: { status: 'captured', value: '台北' },
  },
  userModified: false,
  confirmedAt: null,
};

const section = {
  id: 's-1',
  origin: 'generated',
  text: '完成 PDF 匯出功能',
  citations: [{ claimId: 'claim-1', statedCompletion: 'completed' }],
  sectionConfirmation: null,
};

const valid = {
  SourceDocument: [SourceDocument, sourceDocument],
  Claim: [Claim, claim],
  Profile: [
    Profile,
    {
      id: 'p-1',
      personalInfo: { name: '王小明' },
      experiences: [
        { company: 'A', title: '工程師', startDate: '2020-01', endDate: null, description: '' },
      ],
      skills: ['TypeScript'],
      pdfParseConfirmed: false,
    },
  ],
  ProjectEvidence: [ProjectEvidence, { id: 'pr-1', name: 'RoleCraft', summary: '', claimIds: [] }],
  JobSnapshot: [JobSnapshot, jobSnapshot],
  ResumeVersion: [
    ResumeVersion,
    { id: 'rv-1', jobSnapshotId: 'job-1', sections: [section], createdAt: T },
  ],
  ExportVersion: [
    ExportVersion,
    {
      id: 'ev-1',
      resumeVersionId: 'rv-1',
      exportedAt: T,
      sections: [section],
      pdfHash: 'deadbeef',
      citedClaims: [{ claimId: 'claim-1', claimText: '支援 PDF 匯出', excerptTexts: ['x'] }],
      jobSnapshot,
    },
  ],
  ApplicationRecord: [
    ApplicationRecord,
    { id: 'a-1', initiation: 'invited', appliedAt: T, status: '已投遞', exportVersionId: 'ev-1' },
  ],
  MessageDraft: [
    MessageDraft,
    {
      id: 'm-1',
      platform: 'linkedin',
      captureMethod: 'manual_paste',
      selectedMessageText: '您好，想邀請您面試',
      userModified: false,
      jobSnapshotId: null,
      replyIntent: '詢問職務',
      draft: '',
    },
  ],
  ProviderConnection: [
    ProviderConnection,
    {
      provider: 'claude',
      login: 'passed',
      eligibility: 'unknown',
      availableModels: ['sonnet'],
      subscriptionOnly: 'unknown',
      checkedAt: T,
    },
  ],
  RunCheckRecord: [
    RunCheckRecord,
    {
      id: 'r-1',
      provider: 'codex',
      model: 'gpt',
      trigger: 'run_start',
      checkedAt: T,
      items: {
        subscriptionLogin: { outcome: 'passed', basis: 'login status' },
        environmentSanitized: { outcome: 'passed', basis: 'env' },
        cliConfig: { outcome: 'passed', basis: 'config' },
        executionMode: { outcome: 'passed', basis: 'mode' },
      },
      removedEnvVarNames: ['OPENAI_API_KEY'],
      subscriptionOnly: 'passed',
      executed: true,
    },
  ],
  WorkJob: [
    WorkJob,
    {
      id: 'w-1',
      status: 'paused',
      pauseReason: 'quota_exhausted',
      units: [{ id: 'u-1', status: 'completed', provider: 'claude', model: 'x', retryCount: 0 }],
    },
  ],
} as const;

describe('entity schemas', () => {
  it.each(Object.entries(valid))('%s 合法樣本通過', (_name, [schema, sample]) => {
    expect(schema.safeParse(sample).success).toBe(true);
  });

  it.each(Object.entries(valid))('%s 多帶欄位被拒', (_name, [schema, sample]) => {
    expect(schema.safeParse({ ...sample, extra: 1 }).success).toBe(false);
  });

  it.each([
    ['completionStatus', 'done'],
    ['reviewStatus', 'ok'],
    ['type', 'skill'],
  ])('Claim 非法 %s=%s 被拒', (key, value) => {
    expect(Claim.safeParse({ ...claim, [key]: value }).success).toBe(false);
  });

  it('Claim 功能缺完成狀態被拒；非功能／交付物帶完成狀態被拒', () => {
    const noStatus: Record<string, unknown> = { ...claim };
    delete noStatus.completionStatus;
    expect(Claim.safeParse(noStatus).success).toBe(false);
    expect(Claim.safeParse({ ...noStatus, type: 'personal_role' }).success).toBe(true);
    expect(Claim.safeParse({ ...claim, type: 'link' }).success).toBe(false);
  });

  it('Claim revocationHold 選填（P1-T053）：舊資料可讀；previousStatus 不得為來源已移除、來源不可空', () => {
    const hold = {
      previousStatus: 'normal',
      sources: [{ sourceDocumentId: 'doc-1', contentHash: 'h1' }],
      claimText: '匯出 PDF',
      completionStatus: 'documented_done',
    };
    const held = { ...claim, reviewStatus: 'source_removed', revocationHold: hold };
    expect(Claim.safeParse(claim).success).toBe(true);
    expect(Claim.safeParse(held).success).toBe(true);
    const bads = [
      { ...hold, previousStatus: 'source_removed' },
      { ...hold, sources: [] },
      { ...hold, claimText: ' ' },
      { ...hold, extra: 1 },
    ];
    for (const bad of bads) {
      expect(Claim.safeParse({ ...held, revocationHold: bad }).success).toBe(false);
    }
  });

  it('SourceDocument 非法授權狀態被拒', () => {
    const bad = { ...sourceDocument, authorizationStatus: 'unknown' };
    expect(SourceDocument.safeParse(bad).success).toBe(false);
  });

  it('JobSnapshot 必要欄位空白、非法擷取結果、LinkedIn 自動擷取都被拒', () => {
    const f = jobSnapshot.fields;
    const cases = [
      { ...jobSnapshot, fields: { ...f, company: '' } },
      { ...jobSnapshot, fields: { ...f, location: { status: 'missing' } } },
      { ...jobSnapshot, captureMethod: 'scraped' },
      { ...jobSnapshot, platform: 'linkedin' },
    ];
    for (const c of cases) expect(JobSnapshot.safeParse(c).success).toBe(false);
  });

  it('ResumeVersion 非法宣稱完成程度被拒', () => {
    const bad = { ...section, citations: [{ claimId: 'claim-1', statedCompletion: 'done' }] };
    const rv = { id: 'rv', jobSnapshotId: 'j', sections: [bad], createdAt: T };
    expect(ResumeVersion.safeParse(rv).success).toBe(false);
  });

  it('WorkJob 暫停原因與狀態必須一致', () => {
    const [, job] = valid.WorkJob;
    expect(WorkJob.safeParse({ ...job, pauseReason: null }).success).toBe(false);
    expect(WorkJob.safeParse({ ...job, status: 'running' }).success).toBe(false);
    expect(WorkJob.safeParse({ ...job, status: 'stopped', pauseReason: null }).success).toBe(false);
  });
});

describe('NonEmptyText（codex review P1-T001）', () => {
  it.each(['', ' ', '\n\t', '　　'])('拒絕只有空白：%j', (value) => {
    expect(NonEmptyText.safeParse(value).success).toBe(false);
  });
  it('接受含內容的文字且不修剪', () => {
    expect(NonEmptyText.parse('  工程師 ')).toBe('  工程師 ');
  });
});
