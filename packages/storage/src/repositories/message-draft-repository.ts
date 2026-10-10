import type { DatabaseSync } from 'node:sqlite';

import { MessageDraft } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 招募訊息與回覆草稿（D7：只存，不送出）。關聯的職缺快照若有，必須先存在（外鍵）。 */
export interface MessageDraftRepository {
  save(draft: MessageDraft): MessageDraft;
  get(id: string): MessageDraft | null;
  list(): MessageDraft[];
  delete(id: string): boolean;
}

export function createMessageDraftRepository(db: DatabaseSync): MessageDraftRepository {
  const table = jsonTable(db, 'message_drafts', 'id', MessageDraft);
  return {
    save: (draft) =>
      table.upsert(
        { id: draft.id, platform: draft.platform, job_snapshot_id: draft.jobSnapshotId },
        draft,
      ),
    get: (id) => table.get(id),
    list: () => table.list(),
    delete: (id) => table.delete(id),
  };
}
