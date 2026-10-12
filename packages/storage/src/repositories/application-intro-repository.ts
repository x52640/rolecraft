import type { DatabaseSync } from 'node:sqlite';

import { ApplicationIntro } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/**
 * 投遞自介（P1-T064，D25、D7：只存，不送出）。每個職缺快照只有最近一份；
 * 職缺快照必須先存在（外鍵），快照刪除時一併刪除。
 */
export interface ApplicationIntroRepository {
  /** 新增或整筆取代該職缺快照的自介 */
  save(intro: ApplicationIntro): ApplicationIntro;
  get(jobSnapshotId: string): ApplicationIntro | null;
}

export function createApplicationIntroRepository(db: DatabaseSync): ApplicationIntroRepository {
  const table = jsonTable(db, 'application_intros', 'job_snapshot_id', ApplicationIntro);
  return {
    save: (intro) => table.upsert({ job_snapshot_id: intro.jobSnapshotId }, intro),
    get: (jobSnapshotId) => table.get(jobSnapshotId),
  };
}
