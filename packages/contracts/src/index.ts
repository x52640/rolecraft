/** contracts 的公開入口：核心資料物件與橋接 schema。 */
export const PACKAGE_NAME = '@rolecraft/contracts';

export * from './entities/common.ts';
export * from './entities/source-document.ts';
export * from './entities/claim.ts';
export * from './entities/profile.ts';
export * from './entities/project-evidence.ts';
export * from './entities/job-snapshot.ts';
export * from './entities/resume-version.ts';
export * from './entities/export-version.ts';
export * from './entities/application-record.ts';
export * from './entities/message-draft.ts';
export * from './entities/provider-connection.ts';
export * from './entities/work-job.ts';

export * from './bridge/operations.ts';
export * from './bridge/common.ts';
export * from './bridge/chunk.ts';
export * from './bridge/job-capture.ts';
export * from './bridge/message-capture.ts';
export * from './bridge/draft.ts';
export * from './bridge/editor/jobs.ts';
export * from './bridge/editor/import.ts';
export * from './bridge/editor/sources.ts';
export * from './bridge/editor/applications.ts';
export * from './bridge/editor/providers.ts';
export * from './bridge/editor/export.ts';
export * from './bridge/editor/claims.ts';
export * from './bridge/editor/resume.ts';
export * from './bridge/editor/messages.ts';
export * from './bridge/envelope.ts';
export * from './bridge/protocol.ts';
