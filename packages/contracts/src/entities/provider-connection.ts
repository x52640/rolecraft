import { z } from 'zod';

import { Id, NonEmptyText, Provider, Timestamp } from './common.ts';

/**
 * 檢查結果。無法確認時一律 unknown（不得假裝通過）；只有 passed 算成立。
 */
export const CheckOutcome = z.enum(['passed', 'failed', 'unknown']);
export type CheckOutcome = z.infer<typeof CheckOutcome>;

/** 供應商連接（architecture.md ProviderConnection）。 */
export const ProviderConnection = z.strictObject({
  provider: Provider,
  /** 登入狀態 */
  login: CheckOutcome,
  /** 資格狀態 */
  eligibility: CheckOutcome,
  availableModels: z.array(NonEmptyText),
  /** 訂閱限定檢查（D2、D12） */
  subscriptionOnly: CheckOutcome,
  checkedAt: Timestamp,
});
export type ProviderConnection = z.infer<typeof ProviderConnection>;

/**
 * R6 確認時機（providers.md R6：每次執行前、排隊中的工作開始時、暫停後續跑時都重新確認）。
 */
export const RunCheckTrigger = z.enum([
  'run_start', // 直接執行
  'queued_start', // 排隊中的工作開始
  'resume', // 暫停後續跑
]);
export type RunCheckTrigger = z.infer<typeof RunCheckTrigger>;

/** 單項確認：結果＋依據（依據是 S9-2 證據，不得含環境變數的值）。 */
export const RunCheckItem = z.strictObject({
  outcome: CheckOutcome,
  basis: NonEmptyText,
});
export type RunCheckItem = z.infer<typeof RunCheckItem>;

/**
 * R6 各項（D12：不檢查使用者自行開啟的額外用量，所以沒有那一項）。
 */
export const RunCheckItems = z.strictObject({
  /** R6-1 官方工具自己回報目前是訂閱登入，不是 API key */
  subscriptionLogin: RunCheckItem,
  /** R6-2 子程序環境已移除已知 API key 與雲端計費設定 */
  environmentSanitized: RunCheckItem,
  /** R6-2 CLI 設定沒有改走 API key 或其他計費供應商 */
  cliConfig: RunCheckItem,
  /** R6-3 不使用會改走 API key 的執行模式；不自動加購 */
  executionMode: RunCheckItem,
});
export type RunCheckItems = z.infer<typeof RunCheckItems>;

/**
 * 每次執行的 R6 確認紀錄。`subscriptionOnly` 是總結：四項全部 passed 才可為 passed；
 * `executed` 為 true 時總結必須 passed（任何一項不成立就不執行）。
 */
export const RunCheckRecord = z
  .strictObject({
    id: Id,
    provider: Provider,
    model: NonEmptyText,
    trigger: RunCheckTrigger,
    checkedAt: Timestamp,
    items: RunCheckItems,
    /** 從子程序環境移除的變數名稱（只記名稱，不記值） */
    removedEnvVarNames: z.array(NonEmptyText),
    subscriptionOnly: CheckOutcome,
    /** 確認後是否真的執行 */
    executed: z.boolean(),
  })
  .superRefine((record, ctx) => {
    const allPassed = Object.values(record.items).every((item) => item.outcome === 'passed');
    if (record.subscriptionOnly === 'passed' && !allPassed) {
      ctx.addIssue({
        code: 'custom',
        path: ['subscriptionOnly'],
        message: 'R6 任一項未通過時總結不得為 passed',
      });
    }
    if (record.executed && record.subscriptionOnly !== 'passed') {
      ctx.addIssue({
        code: 'custom',
        path: ['executed'],
        message: 'R6 未全部通過不得執行',
      });
    }
  });
export type RunCheckRecord = z.infer<typeof RunCheckRecord>;
