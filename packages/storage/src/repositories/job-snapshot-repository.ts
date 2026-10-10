import type { DatabaseSync } from 'node:sqlite';

import { JobSnapshot } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 職缺快照（R10）。刪除只走 deleteMaterial（D19）；被履歷版本或回覆草稿引用時不可刪除（外鍵）。 */
export interface JobSnapshotRepository {
  save(snapshot: JobSnapshot): JobSnapshot;
  get(id: string): JobSnapshot | null;
  list(): JobSnapshot[];
}

export function createJobSnapshotRepository(db: DatabaseSync): JobSnapshotRepository {
  const table = jsonTable(db, 'job_snapshots', 'id', JobSnapshot);
  return {
    save: (snapshot) =>
      table.upsert(
        { id: snapshot.id, platform: snapshot.platform, captured_at: snapshot.capturedAt },
        snapshot,
      ),
    get: (id) => table.get(id),
    list: () => table.list(),
  };
}
