import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  Claim,
  JobSnapshot,
  MessageDraft,
  Profile,
  ProjectEvidence,
  ProviderConnection,
  ResumeVersion,
  RunCheckRecord,
  SourceDocument,
  WorkJob,
} from '@rolecraft/contracts';

import { openDatabase, type OpenDatabaseOptions } from '../database.ts';
import { newId, nowTimestamp } from '../ids.ts';

/** 暫存資料夾＋資料庫檔；測試結束呼叫 cleanup。 */
export function tempDatabase(options?: OpenDatabaseOptions) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-storage-'));
  const file = path.join(dir, 'rolecraft.db');
  const opened = openDatabase(file, options);
  return {
    dir,
    file,
    ...opened,
    cleanup: () => {
      if (opened.db.isOpen) opened.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const T = nowTimestamp(new Date('2026-10-10T08:00:00Z'));

export const sourceDocument = (over: Partial<SourceDocument> = {}): SourceDocument => ({
  id: newId(),
  folderPath: '/Users/me/projects/rolecraft',
  documentPath: '/Users/me/projects/rolecraft/README.md',
  contentHash: 'a'.repeat(64),
  contentVersion: 1,
  authorizationStatus: 'authorized',
  importedAt: T,
  ...over,
});

export const claim = (sourceDocumentId: string, over: Partial<Claim> = {}): Claim => ({
  id: newId(),
  type: 'feature',
  text: '支援 PDF 匯出',
  completionStatus: 'documented_done',
  basis: {
    sourceExcerpts: [
      {
        sourceDocumentId,
        contentVersion: 1,
        contentHash: 'a'.repeat(64),
        location: 'p1',
        text: '已完成 PDF 匯出',
      },
    ],
    userConfirmation: null,
  },
  reviewStatus: 'normal',
  ...over,
});

export const profile = (): Profile => ({
  id: newId(),
  personalInfo: { name: '王小明' },
  experiences: [
    { company: 'A 公司', title: '工程師', startDate: '2020-01', endDate: null, description: '' },
  ],
  skills: ['TypeScript'],
  pdfParseConfirmed: false,
});

export const projectEvidence = (claimIds: string[]): ProjectEvidence => ({
  id: newId(),
  name: 'RoleCraft',
  summary: '履歷編輯器',
  claimIds,
});

export const jobSnapshot = (over: Partial<JobSnapshot> = {}): JobSnapshot => ({
  id: newId(),
  platform: '104',
  url: 'https://www.104.com.tw/job/abc',
  capturedAt: T,
  captureMethod: 'auto',
  fields: {
    company: 'B 公司',
    title: '前端工程師',
    description: '負責前端',
    responsibilities: { status: 'captured', value: '寫程式' },
    requirements: { status: 'not_captured' },
    preferredQualifications: { status: 'not_provided' },
    location: { status: 'captured', value: '台北' },
  },
  userModified: false,
  confirmedAt: null,
  ...over,
});

export const resumeVersion = (jobSnapshotId: string, claimId: string): ResumeVersion => ({
  id: newId(),
  jobSnapshotId,
  sections: [
    {
      id: newId(),
      origin: 'generated',
      text: '完成 PDF 匯出功能',
      citations: [{ claimId, statedCompletion: 'completed' }],
      sectionConfirmation: null,
    },
  ],
  createdAt: T,
});

export const messageDraft = (jobSnapshotId: string | null): MessageDraft => ({
  id: newId(),
  platform: 'linkedin',
  captureMethod: 'manual_paste',
  selectedMessageText: '您好，想邀請您面試',
  userModified: false,
  jobSnapshotId,
  replyIntent: '接受邀約',
  draft: '謝謝邀請',
});

export const providerConnection = (over: Partial<ProviderConnection> = {}): ProviderConnection => ({
  provider: 'claude',
  login: 'passed',
  eligibility: 'passed',
  availableModels: ['sonnet'],
  subscriptionOnly: 'passed',
  checkedAt: T,
  ...over,
});

export const runCheckRecord = (over: Partial<RunCheckRecord> = {}): RunCheckRecord => ({
  id: newId(),
  provider: 'claude',
  model: 'sonnet',
  checkedAt: T,
  subscriptionOnly: 'passed',
  ...over,
});

export const workJob = (): WorkJob => ({
  id: newId(),
  status: 'running',
  pauseReason: null,
  units: [
    { id: newId(), status: 'completed', provider: 'claude', model: 'sonnet', retryCount: 0 },
    { id: newId(), status: 'pending', provider: null, model: null, retryCount: 1 },
  ],
});
