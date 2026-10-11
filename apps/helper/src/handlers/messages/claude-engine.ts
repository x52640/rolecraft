// 草稿生成用的 AI 執行端。只用使用者在設定頁選定、且目前「可用」的 Claude 模型（不代為挑選）；
// 執行一律經 Claude 服務的 run（版本閘門＋runWithSubscriptionCheck，R5、R6 每次重做），
// deps 一律經 helperClaudeDeps 套串流守門。模型名稱只來自 providers 的候選常數，不來自請求。
import { randomUUID } from 'node:crypto';
import process from 'node:process';

import type { Provider } from '@rolecraft/contracts';
import {
  CLAUDE_MODEL_CANDIDATES,
  type ClaudeService,
  createClaudeService,
  type RunDeps,
  type RunOutcome,
} from '@rolecraft/providers';

import { helperClaudeDeps } from '../../services/claude-deps.ts';
import { claudeServiceOf } from '../providers/providers-service.ts';
import type { ProvidersService } from '../providers/service.ts';

export interface DraftEngine {
  readonly provider: Provider;
  readonly model: string;
  execute(request: { prompt: string; signal: AbortSignal }): Promise<RunOutcome>;
}

/** 目前可用的執行端；沒有可用且已選定模型的服務回 null。 */
export type ResolveDraftEngine = () => Promise<DraftEngine | null>;

export interface ClaudeDraftEngineOptions {
  readonly providers: ProvidersService;
  /** 預設用 providers 服務的 Claude 服務（claudeServiceOf）；取不到才自己建一個（不接保存介面） */
  readonly service?: ClaudeService;
  /** 測試用：覆寫執行 deps（環境、時鐘、子程序啟動函式）；一律再經 helperClaudeDeps */
  readonly runDeps?: Partial<RunDeps>;
  /** 必須與 providers 服務配發候選時用的清單相同（預設同為 CLAUDE_MODEL_CANDIDATES） */
  readonly candidates?: readonly string[];
}

/** 由 providers 的狀態與候選清單找出選定的模型別名；對不上就不猜，回 null。 */
async function selectedClaudeModel(
  providers: ProvidersService,
  candidates: readonly string[],
): Promise<string | null> {
  if (!providers.status || !providers.listCandidates) return null;
  const claude = (await providers.status()).find((s) => s.service === 'claude');
  if (claude?.state !== 'available' || claude.selectedCandidateId === null) return null;
  const listed = await providers.listCandidates('claude');
  if (listed.length !== candidates.length) return null;
  const index = listed.findIndex((c) => c.candidateId === claude.selectedCandidateId);
  return index < 0 ? null : (candidates[index] ?? null);
}

export function createClaudeDraftEngine(options: ClaudeDraftEngineOptions): ResolveDraftEngine {
  // 預設與 providers 服務共用同一個 Claude 服務（同一版本閘門；有資料區時已接已驗證版本保存）。
  const service = options.service ?? claudeServiceOf(options.providers) ?? createClaudeService();
  const candidates = options.candidates ?? CLAUDE_MODEL_CANDIDATES;
  const base = (): RunDeps => ({
    parentEnv: process.env,
    now: () => new Date(),
    newId: randomUUID,
    ...options.runDeps,
  });
  return async () => {
    const model = await selectedClaudeModel(options.providers, candidates);
    if (model === null) return null;
    return {
      provider: 'claude',
      model,
      async execute({ prompt, signal }) {
        const deps = helperClaudeDeps(base(), { acceptVersion: service.gate.isAccepted });
        const { outcome } = await service.run(
          { model, prompt, trigger: 'run_start', signal },
          deps,
        );
        return outcome;
      },
    };
  };
}
