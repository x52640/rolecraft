import type { DatabaseSync } from 'node:sqlite';

import type { Provider } from '@rolecraft/contracts';

import { StorageError } from '../errors.ts';

/**
 * 使用者選定的模型（P1-T058）：存模型別名本身，不存每次啟動重新配發的候選 ID；
 * 每個服務一筆，新選定覆蓋舊的。
 */
export interface ProviderSelectionRepository {
  get(provider: Provider): string | null;
  save(provider: Provider, model: string, selectedAt: string): void;
}

export function createProviderSelectionRepository(db: DatabaseSync): ProviderSelectionRepository {
  return {
    get(provider) {
      const row = db
        .prepare('SELECT model FROM provider_selections WHERE provider = ?')
        .get(provider);
      if (!row) return null;
      const model = row['model'];
      if (typeof model !== 'string' || model === '') {
        throw new StorageError(`provider_selections[${provider}]：model 欄不合法`);
      }
      return model;
    },
    save(provider, model, selectedAt) {
      db.prepare(
        `INSERT INTO provider_selections (provider, model, selected_at) VALUES (?, ?, ?)
         ON CONFLICT (provider) DO UPDATE SET model = excluded.model, selected_at = excluded.selected_at`,
      ).run(provider, model, selectedAt);
    },
  };
}
