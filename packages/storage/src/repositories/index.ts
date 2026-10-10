import type { DatabaseSync } from 'node:sqlite';

import { createClaimRepository, type ClaimRepository } from './claim-repository.ts';
import {
  createJobSnapshotRepository,
  type JobSnapshotRepository,
} from './job-snapshot-repository.ts';
import {
  createMessageDraftRepository,
  type MessageDraftRepository,
} from './message-draft-repository.ts';
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
}

/** 組出所有核心物件的 repository（共用同一個資料庫連線）。 */
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
  };
}

export type {
  ClaimRepository,
  JobSnapshotRepository,
  MessageDraftRepository,
  ProfileRepository,
  ProjectEvidenceRepository,
  ProviderConnectionRepository,
  ResumeVersionRepository,
  RunCheckRecordRepository,
  SourceDocumentRepository,
  WorkJobRepository,
};
