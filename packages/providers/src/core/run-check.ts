import {
  type CheckOutcome,
  RunCheckRecord,
  type RunCheckItem,
  RunCheckItems,
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
 * 取消發生在確認開始前或確認途中 → status 'cancelled'（不是 blocked：使用者取消不是 R6 不成立）。
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
      /** 確認開始前或確認途中被取消；未執行（record.executed=false），result 一律 cancelled */
      readonly status: 'cancelled';
      readonly record: RunCheckRecord;
      readonly result: ExecutionResult;
    }
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

/** R6 四項固定 key；總結逐一檢查，缺項視為 unknown（不靠 Object.values）。 */
const CHECK_KEYS = [
  'subscriptionLogin',
  'environmentSanitized',
  'cliConfig',
  'executionMode',
] as const satisfies readonly (keyof RunCheckItems)[];

/** 適配器自己回報的三項（與 contracts 同一份 schema，只去掉 core 判定的環境清理）。 */
const AdapterRouteChecks = RunCheckItems.omit({ environmentSanitized: true });

const INVALID_REPORT = '適配器回報格式不合法';
const CANCELLED_DURING_CHECK = '確認途中被取消';

/** 總結：四項全部 passed 才 passed；有 failed 則 failed；其餘（含缺項）unknown。 */
export function summarizeChecks(items: RunCheckItems): CheckOutcome {
  const outcomes = CHECK_KEYS.map(
    (key) => (items as Partial<RunCheckItems> | undefined)?.[key]?.outcome ?? 'unknown',
  );
  if (outcomes.every((o) => o === 'passed')) return 'passed';
  return outcomes.includes('failed') ? 'failed' : 'unknown';
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : '未知錯誤';
}

/** routeChecks 的結果；reportValid=false 表示適配器回報不符 schema（缺項、空依據、多餘欄位）。 */
export interface RouteCheckResult {
  readonly checks: SubscriptionRouteChecks;
  readonly reportValid: boolean;
}

/** 適配器回報的 R6 項目＋core 自己的禁用旗標檢查；丟錯或格式不合法一律 unknown。 */
export async function routeChecks(
  adapter: ProviderAdapter,
  launch: Launch,
  signal: AbortSignal | undefined,
): Promise<RouteCheckResult> {
  let raw: unknown;
  try {
    raw = await adapter.verifySubscriptionRoute(signal ? { launch, signal } : { launch });
  } catch (error) {
    return { checks: allUnknown(`確認時發生錯誤：${describeError(error)}`), reportValid: true };
  }
  // 執行前就用 contracts schema 驗證，不靠事後 parse 紀錄才發現缺項。
  const parsed = AdapterRouteChecks.safeParse(raw);
  if (!parsed.success) return { checks: allUnknown(INVALID_REPORT), reportValid: false };
  let checks: SubscriptionRouteChecks = parsed.data;
  // core 自己再檢查一次禁用旗標，不只相信適配器的回報。
  const flags = adapter.commands.flatMap((c) => findApiKeyModeFlags(adapter.provider, c));
  if (flags.length > 0) {
    checks = {
      ...checks,
      executionMode: item('failed', `命令含會改走 API key 的旗標：${flags.join(', ')}`),
    };
  }
  return { checks, reportValid: true };
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

  // 取消不寫成 R6 失敗：三項 unknown、依據「確認途中被取消」，環境清理照實記。
  const cancelled = (): RunOutcome => {
    const items = { ...allUnknown(CANCELLED_DURING_CHECK), environmentSanitized };
    return {
      status: 'cancelled',
      record: RunCheckRecord.parse({
        ...base,
        items,
        removedEnvVarNames: [...removed],
        subscriptionOnly: summarizeChecks(items),
        executed: false,
      }),
      result: { ok: false, error: { kind: 'cancelled', message: '使用者已取消' } },
    };
  };
  if (request.signal?.aborted) return cancelled();

  return withEmptyWorkDir(async (cwd) => {
    const launch = createLauncher({
      provider: adapter.provider,
      env: sanitized.env,
      cwd,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    });
    const route = await routeChecks(adapter, launch, request.signal);
    if (request.signal?.aborted) return cancelled();
    // 再用完整 schema 驗一次四項；任何不合法 → 四項都記 unknown 並擋下。
    const parsedItems = route.reportValid
      ? RunCheckItems.safeParse({ ...route.checks, environmentSanitized })
      : null;
    if (!parsedItems?.success) {
      return blocked(
        { ...allUnknown(INVALID_REPORT), environmentSanitized: item('unknown', INVALID_REPORT) },
        removed,
      );
    }
    const items = parsedItems.data;
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
