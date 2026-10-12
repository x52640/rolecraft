// 服務組裝入口：履歷匯入＋AI 整理（P1-T069）。AI 整理與履歷生成同一個選模型與執行做法
// （createClaudeGenerationEngine：ClaudeService.run＋helperClaudeDeps，R5、R6 每次重做），R6 紀錄存進資料區。
import type { DatabaseSync } from 'node:sqlite';

import { createRepositories } from '@rolecraft/storage';

import type { ProvidersService } from '../providers/service.ts';
import { createClaudeGenerationEngine } from '../resume/claude-engine.ts';
import { createResumeImportService, type PdfFilePicker } from './import-service.ts';
import type { ResumeImportService } from './service.ts';

export function createResumeImportWithClaude(
  db: DatabaseSync,
  picker: PdfFilePicker,
  providers: ProvidersService,
): ResumeImportService {
  const repos = createRepositories(db);
  return createResumeImportService({
    picker,
    profiles: repos.profiles,
    ai: {
      engine: createClaudeGenerationEngine({ providers }),
      recordRunCheck: (record) => {
        repos.runCheckRecords.append(record);
      },
    },
  });
}
