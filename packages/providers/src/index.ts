/** @rolecraft/providers 公開入口：適配介面、環境清理、R6 確認紀錄、Claude 適配器（D2、D12、R5、R6）。 */
export const PACKAGE_NAME = '@rolecraft/providers';

export type {
  ExecuteRequest,
  ExecutionResult,
  InstallationStatus,
  LoginStatus,
  ModelList,
  ProbeContext,
  ProviderAdapter,
  ProviderError,
  ProviderErrorKind,
  SubscriptionRouteChecks,
  SupportStatus,
} from './core/adapter.ts';
export { SUPPORT_LABELS } from './core/adapter.ts';
export {
  BILLING_ENV_KEYWORDS,
  BILLING_ENV_NAMES,
  BILLING_ENV_PREFIXES,
  isBillingEnvName,
} from './core/billing-env.ts';
export {
  API_KEY_MODE_FLAGS,
  CommandPolicyError,
  type CommandSpec,
  defineCommand,
  isValidModelId,
  MODEL_SLOT,
} from './core/command.ts';
export { checkConnection, type ConnectionDeps, type ConnectionReport } from './core/connection.ts';
export {
  BASE_ENV_ALLOWLIST,
  type EnvironmentPolicy,
  EnvironmentPolicyError,
  type ParentEnv,
  type SanitizedEnvironment,
  sanitizeEnvironment,
} from './core/environment.ts';
export type { Launch, LaunchRequest, ProcessOutput } from './core/process.ts';
export {
  type RunDeps,
  type RunOutcome,
  type RunRequest,
  runWithSubscriptionCheck,
} from './core/run-check.ts';
export { createUnsupportedAdapter } from './core/unsupported.ts';
export {
  type ClaudeAdapter,
  type ClaudeAdapterOptions,
  createClaudeAdapter,
} from './claude/adapter.ts';
export {
  CLAUDE_ENVIRONMENT,
  CLAUDE_FORBIDDEN_FLAGS,
  CLAUDE_MODEL_CANDIDATES,
  CLAUDE_VERIFIED_VERSION,
  findForbiddenClaudeArgs,
} from './claude/constants.ts';
export { createClaudeStreamGuard, type StreamGuardOptions } from './claude/guard.ts';
export { locateClaude } from './claude/locate.ts';
export { MODEL_PROBE_PROMPT, type ModelProbeResult, verifyClaudeModel } from './claude/models.ts';
export type { ClaudeRunInfo } from './claude/result.ts';
export type { StreamViolation } from './claude/stream.ts';
export {
  createFakeAdapter,
  type FakeAdapter,
  type FakeAdapterOptions,
  type FakeStep,
} from './fake/fake-adapter.ts';
