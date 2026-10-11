// 服務組裝入口（main.ts 只呼叫這裡）：履歷服務＋使用者選定的 Claude 模型；啟動時暫停中斷的工作。
import type { DatabaseSync } from 'node:sqlite';

import { restoreWorkRun } from '@rolecraft/domain';
import { createRepositories, transaction } from '@rolecraft/storage';

import type { ProvidersService } from '../providers/service.ts';
import { claimGateOf } from '../sources/claim-gate.ts';
import type { SourcesService } from '../sources/service.ts';
import { createClaudeGenerationEngine } from './claude-engine.ts';
import type { ResumeService } from './service.ts';
import { createResumeService } from './storage-service.ts';

export function createResumeWithClaude(
  db: DatabaseSync,
  providers: ProvidersService,
  sources?: SourcesService,
): ResumeService {
  return createResumeService({
    db,
    generation: createClaudeGenerationEngine({ providers }),
    claimGate: claimGateOf(sources),
  });
}

/**
 * helper 啟動、開好資料區後呼叫一次：上次程序留下的 running 工作已沒有執行中的嘗試，
 * 一律以 domain restoreWorkRun 改為已暫停（interrupted），等使用者主動續跑（D21）。
 * 列出與存檔放在同一交易，不會用舊快照蓋掉期間由別的連線完成的工作。
 */
export function pauseInterruptedJobs(db: DatabaseSync): void {
  const jobs = createRepositories(db).workJobs;
  transaction(db, () => {
    for (const job of jobs.list()) {
      if (job.status === 'running') jobs.save(restoreWorkRun(job).job);
    }
  });
}
