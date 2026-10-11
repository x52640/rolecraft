// 服務組裝入口（main.ts 只呼叫這裡）：分析服務＝資料區＋sources 服務的授權集合＋使用者選定的 Claude 模型。
import type { DatabaseSync } from 'node:sqlite';

import { SourceRegistry } from '@rolecraft/sources';
import { createRepositories } from '@rolecraft/storage';

import type { ProvidersService } from '../providers/service.ts';
import type { SourcesService } from '../sources/service.ts';
import { createClaudeAnalysisEngine } from './engine.ts';
import { createAnalysis } from './flow.ts';
import type { AnalysisService } from './service.ts';

/** sources 服務帶著授權集合才接得上（讀檔只能經由它，R4）；否則不接，analysis.* 回 not_implemented。 */
function registryOf(sources: SourcesService): SourceRegistry | null {
  const registry: unknown = (sources as { registry?: unknown }).registry;
  return registry instanceof SourceRegistry ? registry : null;
}

export function createAnalysisWithClaude(
  db: DatabaseSync,
  providers: ProvidersService,
  sources: SourcesService,
): AnalysisService {
  const registry = registryOf(sources);
  if (registry === null) return {};
  return createAnalysis({
    db,
    repos: createRepositories(db),
    registry,
    engine: createClaudeAnalysisEngine({ providers }),
  });
}
