// providers 服務的資料區保存（P1-T058）：選定的模型（存模型別名，重啟時對回目前配發的候選）、
// 連接狀態（provider_connections）、R6 確認紀錄（run_check_records，只增），
// 以及 Claude CLI 已驗證版本（ClaudeVersionStore，D22）。沒有資料區時不接這裡，全在記憶體。
import type { DatabaseSync } from 'node:sqlite';

import type { Provider, ProviderConnection, RunCheckRecord } from '@rolecraft/contracts';
import { jsonClaudeVersionStore } from '@rolecraft/providers';
import { createRepositories, nowTimestamp } from '@rolecraft/storage';

import { createHelperClaudeService } from './claude-probe.ts';
import type { ProvidersServiceOptions } from './providers-service.ts';

export interface ProvidersStore {
  loadSelectedModel(provider: Provider): string | null;
  saveSelectedModel(provider: Provider, model: string): void;
  saveConnection(connection: ProviderConnection): void;
  appendRunCheck(record: RunCheckRecord): void;
}

export function createProvidersStore(db: DatabaseSync): ProvidersStore {
  const repos = createRepositories(db);
  return {
    loadSelectedModel: (provider) => repos.providerSelections.get(provider),
    saveSelectedModel: (provider, model) =>
      repos.providerSelections.save(provider, model, nowTimestamp()),
    saveConnection: (connection) => void repos.providerConnections.save(connection),
    appendRunCheck: (record) => void repos.runCheckRecords.append(record),
  };
}

/**
 * 有資料區時 providers 服務的選項：保存介面＋接上已驗證版本保存的 Claude 服務。
 * 這個 Claude 服務也由草稿／履歷生成共用（claudeServiceOf），版本閘門與重新驗證只有一份。
 */
export function persistedProvidersOptions(db: DatabaseSync): ProvidersServiceOptions {
  const versions = createRepositories(db).claudeVersionRecords;
  return {
    store: createProvidersStore(db),
    service: createHelperClaudeService(jsonClaudeVersionStore(versions)),
  };
}
