/** R9 重試策略：額度錯誤不重試；暫時性錯誤有上限、間隔逐次拉長。 */
export interface RetryPolicy {
  /** 暫時性錯誤自動重試上限（R9 預設 2 次） */
  readonly maxTransientRetries: number;
  /** 第 1 次重試前的等待毫秒數 */
  readonly baseDelayMs: number;
  /** 每次重試的間隔倍數（> 1，確保逐次拉長） */
  readonly backoffFactor: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxTransientRetries: 2,
  baseDelayMs: 2_000,
  backoffFactor: 2,
};

/** 第 n 次重試（從 1 起算）前要等待的毫秒數。 */
export function retryDelayMs(
  retryNumber: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  if (!Number.isInteger(retryNumber) || retryNumber < 1) {
    throw new RangeError(`retryNumber 必須是 ≥ 1 的整數：${retryNumber}`);
  }
  return policy.baseDelayMs * policy.backoffFactor ** (retryNumber - 1);
}
