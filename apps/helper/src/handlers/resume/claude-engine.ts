// resume.generate 的 Claude 執行（P1-T025）：一律經 ClaudeService.run（版本閘門＋runWithSubscriptionCheck，
// 每次送出重做 R6），deps 一律經 helperClaudeDeps（串流守門）。helper 不自己組 CLI 命令列。
// 模型只能來自呼叫端的選定函式（應回 helper 自己的候選常數），請求字串永遠不會成為模型參數（R7）。
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import type { InputBudget } from '@rolecraft/domain';
import { createClaudeService, type ClaudeService, type RunDeps } from '@rolecraft/providers';

import { helperClaudeDeps } from '../../services/claude-deps.ts';
import type { GenerationEngine } from './generation.ts';

export interface ClaudeEngineOptions {
  /** 與 providers 檢查共用的 Claude 服務（版本閘門互斥）；預設自己建一個 */
  readonly service?: ClaudeService;
  /** 目前選定且可用的模型；沒有回 null（不送出） */
  readonly selectModel: () => Promise<string | null>;
  /** 該模型的輸入預算（R8） */
  readonly budget: InputBudget;
  /** 測試用：覆寫執行 deps（環境、時鐘、子程序啟動函式）；一律再經 helperClaudeDeps */
  readonly runDeps?: Partial<RunDeps>;
  /** 測試用：重試等待 */
  readonly sleep?: GenerationEngine['sleep'];
}

export function createClaudeGenerationEngine(options: ClaudeEngineOptions): GenerationEngine {
  const service = options.service ?? createClaudeService();
  const base = (): RunDeps => ({
    parentEnv: process.env,
    now: () => new Date(),
    newId: randomUUID,
    ...options.runDeps,
  });
  return {
    async select() {
      const model = await options.selectModel();
      return model === null ? null : { provider: 'claude', model, budget: options.budget };
    },
    async execute({ model, prompt, signal }) {
      const deps = helperClaudeDeps(base(), { acceptVersion: service.gate.isAccepted });
      const { outcome } = await service.run({ model, prompt, trigger: 'run_start', signal }, deps);
      return outcome;
    },
    ...(options.sleep && { sleep: options.sleep }),
  };
}
