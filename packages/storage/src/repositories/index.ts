import type { DatabaseSync } from 'node:sqlite';

import {
  createAnalysisStateRepository,
  type AnalysisStateRepository,
} from './analysis-state-repository.ts';
import {
  createAuthorizedFolderRepository,
  type AuthorizedFolderRepository,
} from './authorized-folder-repository.ts';
import { createClaimRepository, type ClaimRepository } from './claim-repository.ts';
import {
  createClaudeVersionRecordRepository,
  type ClaudeVersionRecordRepository,
} from './claude-version-record-repository.ts';
import {
  createJobSnapshotRepository,
  type JobSnapshotRepository,
} from './job-snapshot-repository.ts';
import {
  createMessageDraftRepository,
  type MessageDraftRepository,
} from './message-draft-repository.ts';
import {
  createProviderSelectionRepository,
  type ProviderSelectionRepository,
} from './provider-selection-repository.ts';
import { createProfileRepository, type ProfileRepository } from './profile-repository.ts';
import {
  createProjectEvidenceRepository,
  type ProjectEvidenceRepository,
} from './project-evidence-repository.ts';
import {
  createProviderConnectionRepository,
  type ProviderConnectionRepository,
} from './provider-connection-repository.ts';
import {
  createResumeVersionRepository,
  type ResumeVersionRepository,
} from './resume-version-repository.ts';
import {
  createRunCheckRecordRepository,
  type RunCheckRecordRepository,
} from './run-check-record-repository.ts';
import {
  createSourceDocumentRepository,
  type SourceDocumentRepository,
} from './source-document-repository.ts';
import {
  createSourceReadLogRepository,
  type SourceReadLogRepository,
} from './source-read-log-repository.ts';
import { createWorkJobRepository, type WorkJobRepository } from './work-job-repository.ts';

export interface Repositories {
  profiles: ProfileRepository;
  sourceDocuments: SourceDocumentRepository;
  claims: ClaimRepository;
  projectEvidence: ProjectEvidenceRepository;
  jobSnapshots: JobSnapshotRepository;
  resumeVersions: ResumeVersionRepository;
  messageDrafts: MessageDraftRepository;
  providerConnections: ProviderConnectionRepository;
  runCheckRecords: RunCheckRecordRepository;
  workJobs: WorkJobRepository;
  authorizedFolders: AuthorizedFolderRepository;
  sourceReadLog: SourceReadLogRepository;
  providerSelections: ProviderSelectionRepository;
  claudeVersionRecords: ClaudeVersionRecordRepository;
  analysisState: AnalysisStateRepository;
}

/**
 * 組出所有核心物件的 repository（共用同一個資料庫連線）。
 * 素材（sourceDocuments、claims、resumeVersions、jobSnapshots）不提供 delete：
 * 刪除只走 deleteMaterial，才會套用 D19（未投遞匯出版本整份刪除、已投遞保留並明示）。
 */
export function createRepositories(db: DatabaseSync): Repositories {
  return {
    profiles: createProfileRepository(db),
    sourceDocuments: createSourceDocumentRepository(db),
    claims: createClaimRepository(db),
    projectEvidence: createProjectEvidenceRepository(db),
    jobSnapshots: createJobSnapshotRepository(db),
    resumeVersions: createResumeVersionRepository(db),
    messageDrafts: createMessageDraftRepository(db),
    providerConnections: createProviderConnectionRepository(db),
    runCheckRecords: createRunCheckRecordRepository(db),
    workJobs: createWorkJobRepository(db),
    authorizedFolders: createAuthorizedFolderRepository(db),
    sourceReadLog: createSourceReadLogRepository(db),
    providerSelections: createProviderSelectionRepository(db),
    claudeVersionRecords: createClaudeVersionRecordRepository(db),
    analysisState: createAnalysisStateRepository(db),
  };
}

export type {
  AnalysisStateRepository,
  AuthorizedFolderRepository,
  ClaimRepository,
  ClaudeVersionRecordRepository,
  JobSnapshotRepository,
  MessageDraftRepository,
  ProfileRepository,
  ProjectEvidenceRepository,
  ProviderConnectionRepository,
  ProviderSelectionRepository,
  ResumeVersionRepository,
  RunCheckRecordRepository,
  SourceDocumentRepository,
  SourceReadLogRepository,
  WorkJobRepository,
};
export type {
  StoredFolder,
  StoredFolderIdentity,
  StoredFolderItem,
  StoredItemStatus,
} from './authorized-folder-repository.ts';
export type {
  AnalysisJobRow,
  AnalyzedDocumentRow,
  DocumentSummaryRow,
} from './analysis-state-repository.ts';
export type { SourceReadLogEntry } from './source-read-log-repository.ts';
