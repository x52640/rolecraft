import type { DatabaseSync } from 'node:sqlite';

import { ResumeVersion } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/**
 * 針對職缺的履歷版本（可編輯草稿）。不可變的匯出版本由 P1-T007 另建，不在這裡。
 * 職缺快照必須先存在（外鍵）。
 */
export interface ResumeVersionRepository {
  save(version: ResumeVersion): ResumeVersion;
  get(id: string): ResumeVersion | null;
  listByJobSnapshot(jobSnapshotId: string): ResumeVersion[];
  delete(id: string): boolean;
}

export function createResumeVersionRepository(db: DatabaseSync): ResumeVersionRepository {
  const table = jsonTable(db, 'resume_versions', 'id', ResumeVersion);
  return {
    save: (version) =>
      table.upsert(
        { id: version.id, job_snapshot_id: version.jobSnapshotId, created_at: version.createdAt },
        version,
      ),
    get: (id) => table.get(id),
    listByJobSnapshot: (jobSnapshotId) => table.list('job_snapshot_id = ?', jobSnapshotId),
    delete: (id) => table.delete(id),
  };
}
