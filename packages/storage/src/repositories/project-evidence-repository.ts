import type { DatabaseSync } from 'node:sqlite';

import { ProjectEvidence } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 專案經歷：摘要與所屬事實項 ID（摘要本身不帶確認狀態，R1）。 */
export interface ProjectEvidenceRepository {
  save(evidence: ProjectEvidence): ProjectEvidence;
  get(id: string): ProjectEvidence | null;
  list(): ProjectEvidence[];
  delete(id: string): boolean;
}

export function createProjectEvidenceRepository(db: DatabaseSync): ProjectEvidenceRepository {
  const table = jsonTable(db, 'project_evidence', 'id', ProjectEvidence);
  return {
    save: (evidence) => table.upsert({ id: evidence.id }, evidence),
    get: (id) => table.get(id),
    list: () => table.list(),
    delete: (id) => table.delete(id),
  };
}
