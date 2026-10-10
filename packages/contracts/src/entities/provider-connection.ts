import { z } from 'zod';

import { Id, NonEmptyText, Provider, Timestamp } from './common.ts';

/**
 * 檢查結果。providers.md（R6）不在本 Task 必讀範圍，狀態值待該 spec 確認；
 * 暫用三態，無法確認時一律 unknown（不得假裝通過）。
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

/** 每次執行的 R6 確認紀錄。欄位待 providers.md 確認。 */
export const RunCheckRecord = z.strictObject({
  id: Id,
  provider: Provider,
  model: NonEmptyText,
  checkedAt: Timestamp,
  subscriptionOnly: CheckOutcome,
});
export type RunCheckRecord = z.infer<typeof RunCheckRecord>;
