/**
 * R8 預算公式：預算 ＝ 上下文上限 － 輸出預留 － 官方工具自身開銷預留。
 * 上下文上限由 providers 取得（官方文件或工具回報，查不到用保守預設值），本檔不負責。
 */

export interface BudgetInput {
  /** 該模型的上下文上限（token）。 */
  readonly contextLimit: number;
  /** 預留給模型輸出的 token。 */
  readonly outputReserve: number;
  /** 官方工具自身開銷預留（系統提示等，無法精確觀測，取保守值）。 */
  readonly toolOverheadReserve: number;
}

export interface InputBudget extends BudgetInput {
  /** 可用於本機組裝輸入（指令、來源、摘要、歷史）的 token 數。 */
  readonly available: number;
}

export type BudgetResult =
  | { readonly ok: true; readonly budget: InputBudget }
  | { readonly ok: false; readonly reason: 'invalid_number' | 'non_positive_budget' };

function isNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** 計算輸入預算；任何數值不合法或扣完不剩，就回傳失敗，不得送出。 */
export function computeInputBudget(input: BudgetInput): BudgetResult {
  const { contextLimit, outputReserve, toolOverheadReserve } = input;
  if (![contextLimit, outputReserve, toolOverheadReserve].every(isNonNegativeInteger)) {
    return { ok: false, reason: 'invalid_number' };
  }
  const available = contextLimit - outputReserve - toolOverheadReserve;
  if (available <= 0) {
    return { ok: false, reason: 'non_positive_budget' };
  }
  return { ok: true, budget: { contextLimit, outputReserve, toolOverheadReserve, available } };
}

/** 估算值是否在預算內（剛好等於算在內）。 */
export function fitsBudget(estimatedTokens: number, budget: InputBudget): boolean {
  return estimatedTokens <= budget.available;
}
