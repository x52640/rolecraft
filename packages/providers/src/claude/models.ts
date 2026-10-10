import type { RunCheckRecord } from '@rolecraft/contracts';

import type { ProviderAdapter, ProviderError } from '../core/adapter.ts';
import { type RunDeps, runWithSubscriptionCheck } from '../core/run-check.ts';
import type { ClaudeAdapter } from './adapter.ts';
import { claudeRunDeps } from './guard.ts';
import type { ClaudeRunInfo } from './result.ts';

/**
 * 模型可用性驗證（F01：模型選單依實際可用與帳號資格產生）。
 * CLI 沒有列模型的指令，所以使用者選定候選別名前，用一次極短呼叫驗證；
 * 走 runWithSubscriptionCheck，所以同樣先過 R6 確認並留下 RunCheckRecord。
 * deps 一律經 claudeRunDeps 套上串流守門（呼叫端忘了包也一樣），init 異常立即終止。
 * 模型資訊取自這次呼叫自己的 executeDetailed 回傳，不讀共用的 adapter.lastRun（可並行）。
 */

export const MODEL_PROBE_PROMPT = '只回覆 OK 兩個字母。';

export interface ModelProbeResult {
  readonly model: string;
  /** 只有 R6 通過、實際執行且成功回覆才算可用 */
  readonly available: boolean;
  /** 實際解析到的完整模型名（init 事件 model，例 claude-haiku-5-5） */
  readonly resolvedModel: string | null;
  readonly contextWindow: number | null;
  readonly error: ProviderError | null;
  readonly record: RunCheckRecord;
}

export async function verifyClaudeModel(
  adapter: ClaudeAdapter,
  model: string,
  deps: RunDeps,
  signal?: AbortSignal,
): Promise<ModelProbeResult> {
  let info: ClaudeRunInfo | null = null;
  const probe: ProviderAdapter = {
    ...adapter,
    execute: async (request) => {
      const run = await adapter.executeDetailed(request);
      info = run.info;
      return run.result;
    },
  };
  const outcome = await runWithSubscriptionCheck(
    probe,
    { model, prompt: MODEL_PROBE_PROMPT, trigger: 'run_start', ...(signal ? { signal } : {}) },
    claudeRunDeps(deps, { acceptVersion: adapter.acceptsVersion }),
  );
  if (outcome.status === 'blocked') {
    return {
      model,
      available: false,
      resolvedModel: null,
      contextWindow: null,
      error: { kind: 'other', message: '執行前確認未通過，未驗證模型' },
      record: outcome.record,
    };
  }
  const ran = info as ClaudeRunInfo | null;
  return {
    model,
    available: outcome.result.ok,
    resolvedModel: ran?.model ?? null,
    contextWindow: ran?.contextWindow ?? null,
    error: outcome.result.ok ? null : outcome.result.error,
    record: outcome.record,
  };
}
