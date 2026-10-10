import type { DatabaseSync } from 'node:sqlite';

import { Profile } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 個人資料（Profile）。原始履歷由 Profile 表示，與各職缺的 ResumeVersion 分開保存。 */
export interface ProfileRepository {
  save(profile: Profile): Profile;
  get(id: string): Profile | null;
  list(): Profile[];
  delete(id: string): boolean;
}

export function createProfileRepository(db: DatabaseSync): ProfileRepository {
  const table = jsonTable(db, 'profiles', 'id', Profile);
  return {
    save: (profile) => table.upsert({ id: profile.id }, profile),
    get: (id) => table.get(id),
    list: () => table.list(),
    delete: (id) => table.delete(id),
  };
}
