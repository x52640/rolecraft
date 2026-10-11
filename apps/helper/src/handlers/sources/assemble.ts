// sources 服務組裝入口（main.ts 只呼叫這裡，P1-T058）。
import type { DatabaseSync } from 'node:sqlite';

import { createSourcesService, type FolderPicker, type LocalSources } from './local-sources.ts';
import { createSourcesStore } from './persistence.ts';
import type { SourcesService } from './service.ts';

/**
 * base：資料區被占用期間已在用的 sources 服務。接手（有 db）時沿用它並接上資料區，
 * 讀檔紀錄、授權變更從此寫進資料區；沒有 base 就新建（有 db 時從資料區還原）。
 */
export function assembleSources(
  base: SourcesService | undefined,
  picker: FolderPicker | undefined,
  db: DatabaseSync | undefined,
): SourcesService {
  if (base) {
    if (db && 'attachStore' in base) (base as LocalSources).attachStore(createSourcesStore(db));
    return base;
  }
  return createSourcesService({
    ...(picker && { picker }),
    ...(db && { store: createSourcesStore(db) }),
  });
}
