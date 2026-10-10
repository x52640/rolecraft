import type { DatabaseSync } from 'node:sqlite';

import { ProviderConnection, type Provider } from '@rolecraft/contracts';

import { jsonTable } from './json-table.ts';

/** 供應商連接狀態：每個服務一筆，最新檢查結果覆蓋舊的。 */
export interface ProviderConnectionRepository {
  save(connection: ProviderConnection): ProviderConnection;
  get(provider: Provider): ProviderConnection | null;
  list(): ProviderConnection[];
}

export function createProviderConnectionRepository(db: DatabaseSync): ProviderConnectionRepository {
  const table = jsonTable(db, 'provider_connections', 'provider', ProviderConnection);
  return {
    save: (connection) => table.upsert({ provider: connection.provider }, connection),
    get: (provider) => table.get(provider),
    list: () => table.list(),
  };
}
