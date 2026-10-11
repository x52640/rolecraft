// 分析用的 AI 執行端（P1-T060）：與履歷生成共用同一個選模型與執行做法——只用使用者在設定頁選定、
// 且目前「可用」的模型；執行一律經 Claude 服務的 run（版本閘門＋providers 的訂閱檢查包裝，R5、R6 每次重做）。
// 模型名稱只來自 providers 的候選常數，不來自請求（R7）。
import type { Provider } from '@rolecraft/contracts';
import type { InputBudget } from '@rolecraft/domain';
import type { RunOutcome } from '@rolecraft/providers';

import type { ProvidersService } from '../providers/service.ts';
import {
  createClaudeGenerationEngine,
  type ClaudeGenerationEngineOptions,
} from '../resume/claude-engine.ts';

export interface AnalysisSelection {
  readonly provider: Provider;
  readonly model: string;
  readonly budget: InputBudget;
  /** 必須經 providers 的訂閱檢查包裝（每次送出都重做 R6、隔離執行） */
  execute(request: { prompt: string; signal: AbortSignal }): Promise<RunOutcome>;
}

export interface AnalysisEngine {
  /** 目前選定且可用的模型；沒有就 null（不讀檔、不送出） */
  select(): Promise<AnalysisSelection | null>;
  /** 續跑前重做 R6（D21、R9）：重新檢查選定的服務，通過才回 true */
  recheck(provider: Provider): Promise<boolean>;
  /** 測試用：重試等待；預設 setTimeout（可被取消） */
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

/** 重新檢查（安裝、登入、R5 版本閘門、R6）；只有「可用」才算通過。 */
async function recheckAvailable(providers: ProvidersService, provider: Provider) {
  if (!providers.recheck) return false;
  try {
    return (await providers.recheck(provider)).state === 'available';
  } catch {
    return false;
  }
}

export function createClaudeAnalysisEngine(
  options: ClaudeGenerationEngineOptions & { readonly providers: ProvidersService },
): AnalysisEngine {
  const generation = createClaudeGenerationEngine(options);
  return {
    select: () => generation.select(),
    recheck: (provider) => recheckAvailable(options.providers, provider),
    ...(options.sleep && { sleep: options.sleep }),
  };
}
