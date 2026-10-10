/** R8 輸入預算與拆批（runtime-and-budget.md）。 */
export { ASCII_CHARS_PER_TOKEN, NON_ASCII_TOKEN_WEIGHT, estimateTokens } from './estimate.ts';
export {
  computeInputBudget,
  fitsBudget,
  type BudgetInput,
  type BudgetResult,
  type InputBudget,
} from './formula.ts';
export { splitByTokens, type TextRange } from './segment.ts';
export {
  SEGMENT_OVERHEAD_TOKENS,
  planBatches,
  type Batch,
  type BatchSegment,
  type PlanBatchesInput,
  type PlanBatchesResult,
  type SourcePiece,
} from './batches.ts';
