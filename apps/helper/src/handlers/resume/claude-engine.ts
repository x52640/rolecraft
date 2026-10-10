// resume.generate 的 Claude 執行（P1-T025）：與 messages 共用同一個選模型與執行做法
// （createClaudeDraftEngine：只用使用者在設定頁選定、且目前「可用」的模型；ClaudeService.run＋helperClaudeDeps，
// R5、R6 每次重做）。模型名稱只來自 providers 的候選常數，請求字串永遠不會成為模型參數（R7）。
import { computeInputBudget, type InputBudget } from '@rolecraft/domain';

import {
  createClaudeDraftEngine,
  type ClaudeDraftEngineOptions,
} from '../messages/claude-engine.ts';
import type { GenerationEngine } from './generation.ts';

/** 輸入預算（R8）：上下文上限取保守值，預留輸出與官方工具自身開銷（與回覆草稿相同）。 */
function defaultBudget(): InputBudget {
  const result = computeInputBudget({
    contextLimit: 200_000,
    outputReserve: 8_000,
    toolOverheadReserve: 40_000,
  });
  if (!result.ok) throw new Error('預設輸入預算不合法');
  return result.budget;
}

export interface ClaudeGenerationEngineOptions extends ClaudeDraftEngineOptions {
  readonly budget?: InputBudget;
  /** 測試用：重試等待 */
  readonly sleep?: GenerationEngine['sleep'];
}

export function createClaudeGenerationEngine(
  options: ClaudeGenerationEngineOptions,
): GenerationEngine {
  const resolve = createClaudeDraftEngine(options);
  const budget = options.budget ?? defaultBudget();
  return {
    async select() {
      const engine = await resolve();
      if (engine === null) return null;
      return {
        provider: engine.provider,
        model: engine.model,
        budget,
        execute: (request) => engine.execute(request),
      };
    },
    ...(options.sleep && { sleep: options.sleep }),
  };
}
