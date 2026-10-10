/** R9 工作單元狀態機（docs/specs/runtime-and-budget.md）。 */
export { DEFAULT_RETRY_POLICY, retryDelayMs, type RetryPolicy } from './policy.ts';
export {
  createWorkRun,
  firstPendingUnit,
  restoreWorkRun,
  type ActiveAttempt,
  type RejectReason,
  type Transition,
  type WorkRun,
} from './state.ts';
export {
  cancelJob,
  completeUnit,
  failUnit,
  resumeJob,
  startUnit,
  type FailOutcome,
  type FailUnitInput,
  type ResumeInput,
  type StartUnitInput,
  type UnitError,
  type WrittenOutput,
} from './transitions.ts';
