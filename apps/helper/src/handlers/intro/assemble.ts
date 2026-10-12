// 服務組裝入口（main.ts 只呼叫這一個）：投遞自介＝資料區＋來源關卡＋使用者選定的 Claude 模型
// （與履歷生成同一個選模型與執行做法：ClaudeService.run＋helperClaudeDeps，R5、R6 每次重做）。
import type { DatabaseSync } from 'node:sqlite';

import { createRepositories } from '@rolecraft/storage';

import type { ProvidersService } from '../providers/service.ts';
import { createClaudeGenerationEngine } from '../resume/claude-engine.ts';
import { claimGateOf } from '../sources/claim-gate.ts';
import type { SourcesService } from '../sources/service.ts';
import { createIntroService } from './intro-service.ts';
import type { IntroService } from './service.ts';

export function createIntroWithClaude(
  db: DatabaseSync,
  providers: ProvidersService,
  sources?: SourcesService,
): IntroService {
  return createIntroService({
    db,
    repos: createRepositories(db),
    engine: createClaudeGenerationEngine({ providers }),
    gate: claimGateOf(sources),
  });
}
