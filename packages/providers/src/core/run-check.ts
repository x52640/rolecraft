import {
  type CheckOutcome,
  RunCheckRecord,
  type RunCheckItem,
  type RunCheckItems,
  type RunCheckTrigger,
} from '@rolecraft/contracts';

import type { ExecutionResult, ProviderAdapter, SubscriptionRouteChecks } from './adapter.ts';
import { findApiKeyModeFlags, isValidModelId } from './command.ts';
import { findBillingEnvNames, type ParentEnv, sanitizeEnvironment } from './environment.ts';
import { createLauncher, type Launch, type SpawnFn } from './process.ts';
import { withEmptyWorkDir } from './workdir.ts';

/**
 * R6 訂閱路線確認＋執行。每次呼叫都重新確認（不沿用安裝精靈或上一次的結果），
 * 任何一項不是 passed（含 unknown、檢查丟錯）就不執行，並留下 RunCheckRecord。
 */

export interface RunRequest {
  readonly model: string;
  readonly prompt: string;
  readonly trigger: RunCheckTrigger;
  readonly signal?: AbortSignal;
}

export interface RunDeps {
  /** 本機輔助程式自己的環境（process.env）；只用來產生清理後的子程序環境 */
  readonly parentEnv: ParentEnv;
  readonly now: () => Date;
  readonly newId: () => string;
  /** 測試用：替換 spawn */
  readonly spawn?: SpawnFn;
}

export type RunOutcome =
  | { readonly status: 'blocked'; readonly record: RunCheckRecord }
  | {
      readonly status: 'executed';
      readonly record: RunCheckRecord;
      readonly result: ExecutionResult;
    };

const item = (outcome: CheckOutcome, basis: string): RunCheckItem => ({ outcome, basis });

function allUnknown(basis: string): SubscriptionRouteChecks {
  return {
    subscriptionLogin: item('unknown', basis),
    cliConfig: item('unknown', basis),
    executionMode: item('unknown', basis),
  };
}

/** 總結：全部 passed 才 passed；有 failed 則 failed；其餘 unknown。 */
export function summarizeChecks(items: RunCheckItems): CheckOutcome {
  const outcomes = Object.values(items).map((i) => i.outcome);
  if (outcomes.every((o) => o === 'passed')) return 'passed';
  return outcomes.includes('failed') ? 'failed' : 'unknown';
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : '未知錯誤';
}

/** 適配器回報的 R6 項目＋core 自己的禁用旗標檢查；丟錯一律 unknown。 */
export async function routeChecks(
  adapter: ProviderAdapter,
  launch: Launch,
  signal: AbortSignal | undefined,
): Promise<SubscriptionRouteChecks> {
  let checks: SubscriptionRouteChecks;
  try {
    checks = await adapter.verifySubscriptionRoute(signal ? { launch, signal } : { launch });
  } catch (error) {
    return allUnknown(`確認時發生錯誤：${describeError(error)}`);
  }
  // core 自己再檢查一次禁用旗標，不只相信適配器的回報。
  const flags = adapter.commands.flatMap((c) => findApiKeyModeFlags(adapter.provider, c));
  if (flags.length > 0) {
    checks = {
      ...checks,
      executionMode: item('failed', `命令含會改走 API key 的旗標：${flags.join(', ')}`),
    };
  }
  return checks;
}

export async function runWithSubscriptionCheck(
  adapter: ProviderAdapter,
  request: RunRequest,
  deps: RunDeps,
): Promise<RunOutcome> {
  const checkedAt = deps.now().toISOString();
  const base = {
    id: deps.newId(),
    provider: adapter.provider,
    model: request.model,
    trigger: request.trigger,
    checkedAt,
  };
  const blocked = (items: RunCheckItems, removed: readonly string[]): RunOutcome => ({
    status: 'blocked',
    record: RunCheckRecord.parse({
      ...base,
      items,
      removedEnvVarNames: [...removed],
      subscriptionOnly: summarizeChecks(items),
      executed: false,
    }),
  });

  if (adapter.support.state !== 'supported') {
    const basis = `此服務${adapter.support.state === 'not_supported' ? '尚未支援' : '無法確認'}：${adapter.support.reason}`;
    return blocked({ ...allUnknown(basis), environmentSanitized: item('unknown', basis) }, []);
  }
  if (!isValidModelId(request.model)) {
    const basis = '模型 ID 格式不合法';
    return blocked({ ...allUnknown(basis), environmentSanitized: item('unknown', basis) }, []);
  }

  let sanitized;
  try {
    sanitized = sanitizeEnvironment(deps.parentEnv, adapter.environment);
  } catch (error) {
    const basis = `環境政策錯誤：${describeError(error)}`;
    return blocked({ ...allUnknown(basis), environmentSanitized: item('failed', basis) }, []);
  }
  const removed = sanitized.removedBillingNames;
  const leaked = findBillingEnvNames(sanitized.env);
  const environmentSanitized =
    leaked.length > 0
      ? item('failed', `子程序環境殘留計費變數：${leaked.join(', ')}`)
      : item(
          'passed',
          removed.length > 0
            ? `已移除 ${removed.length} 個計費相關變數；子程序環境無殘留`
            : '父程序環境未含計費相關變數；子程序環境無殘留',
        );

  return withEmptyWorkDir(async (cwd) => {
    const launch = createLauncher({
      provider: adapter.provider,
      env: sanitized.env,
      cwd,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    });
    const route = await routeChecks(adapter, launch, request.signal);
    const items: RunCheckItems = { ...route, environmentSanitized };
    if (summarizeChecks(items) !== 'passed') return blocked(items, removed);

    let result: ExecutionResult;
    try {
      result = await adapter.execute({
        launch,
        model: request.model,
        prompt: request.prompt,
        ...(request.signal ? { signal: request.signal } : {}),
      });
    } catch (error) {
      result = {
        ok: false,
        error: request.signal?.aborted
          ? { kind: 'cancelled', message: '使用者已取消' }
          : { kind: 'other', message: describeError(error) },
      };
    }
    const record = RunCheckRecord.parse({
      ...base,
      items,
      removedEnvVarNames: [...removed],
      subscriptionOnly: 'passed',
      executed: true,
    });
    return { status: 'executed', record, result };
  });
}
