import type { RunCheckItem } from '@rolecraft/contracts';

import type {
  ExecuteRequest,
  ExecutionResult,
  InstallationStatus,
  LoginStatus,
  ModelList,
  ProbeContext,
  ProviderAdapter,
  SubscriptionRouteChecks,
} from '../core/adapter.ts';
import type { ProcessOutput } from '../core/process.ts';
import {
  type AuthStatus,
  cliConfigItem,
  eligibilityOutcome,
  parseAuthStatus,
  parseVersion,
  subscriptionLoginItem,
  versionItem,
} from './auth.ts';
import {
  CLAUDE_AUTH_STATUS_COMMAND,
  CLAUDE_COMMANDS,
  CLAUDE_ENVIRONMENT,
  CLAUDE_MODEL_CANDIDATES,
  CLAUDE_RUN_COMMAND,
  CLAUDE_VERSION_COMMAND,
} from './constants.ts';
import { findManagedSettings, locateClaude } from './locate.ts';
import { analyzeRun, type ClaudeRunInfo } from './result.ts';

/**
 * Claude 適配器（D13、ADR-0002）。每次執行前 core 會呼叫 verifySubscriptionRoute：
 * 版本（記錄＋比對驗證版本）→ auth status（訂閱登入、無 apiKeySource）→ 受管設定。
 * 執行時固定命令列、提示走 stdin，結束後用 analyzeRun 判定（隔離違規丟棄輸出）。
 */

export interface ClaudeAdapterOptions {
  /** 找 CLI；預設看固定候選路徑（locateClaude） */
  readonly locate?: () => Promise<string | null>;
  /** 受管設定偵測；預設看 CLAUDE_MANAGED_SETTINGS_PATHS */
  readonly findManagedSettings?: () => Promise<string[]>;
}

export interface ClaudeAdapter extends ProviderAdapter {
  /** 最近一次 verifySubscriptionRoute 取得的 CLI 版本 */
  readonly lastCliVersion: string | null;
  /** 最近一次 execute 的附帶資訊（版本、上下文上限、額度狀態）；不含模型文字 */
  readonly lastRun: ClaudeRunInfo | null;
}

const item = (outcome: RunCheckItem['outcome'], basis: string): RunCheckItem => ({
  outcome,
  basis,
});

const NOT_FOUND = '找不到官方 Claude CLI（原生執行檔）';

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): ClaudeAdapter {
  const locate = options.locate ?? (() => locateClaude());
  const managed = options.findManagedSettings ?? (() => findManagedSettings());
  let lastCliVersion: string | null = null;
  let lastRun: ClaudeRunInfo | null = null;

  const run = async (
    ctx: ProbeContext,
    executablePath: string,
    command: typeof CLAUDE_VERSION_COMMAND,
  ): Promise<ProcessOutput> =>
    ctx.launch({
      executablePath,
      command,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });

  const readAuth = async (ctx: ProbeContext, path: string): Promise<AuthStatus | null> =>
    parseAuthStatus(await run(ctx, path, CLAUDE_AUTH_STATUS_COMMAND));

  const adapter: ClaudeAdapter = {
    provider: 'claude',
    support: { state: 'supported' },
    environment: CLAUDE_ENVIRONMENT,
    commands: CLAUDE_COMMANDS,
    get lastCliVersion() {
      return lastCliVersion;
    },
    get lastRun() {
      return lastRun;
    },

    async detectInstallation(ctx): Promise<InstallationStatus> {
      const path = await locate();
      if (!path) return { installed: 'failed', executablePath: null, version: null };
      const version = parseVersion(await run(ctx, path, CLAUDE_VERSION_COMMAND));
      return { installed: version ? 'passed' : 'unknown', executablePath: path, version };
    },

    async checkLogin(ctx): Promise<LoginStatus> {
      const path = await locate();
      if (!path) return { login: 'unknown', eligibility: 'unknown' };
      const status = await readAuth(ctx, path);
      return {
        login: subscriptionLoginItem(status).outcome,
        eligibility: eligibilityOutcome(status),
      };
    },

    /**
     * CLI 沒有列出模型的指令，只能回候選別名，outcome 一律 unknown（不假設可用）。
     * 要確認可用請用 verifyClaudeModel（經 R6 確認後做一次極短呼叫）。
     */
    listModels(): Promise<ModelList> {
      return Promise.resolve({ outcome: 'unknown', models: [...CLAUDE_MODEL_CANDIDATES] });
    },

    async verifySubscriptionRoute(ctx): Promise<SubscriptionRouteChecks> {
      const path = await locate();
      if (!path) {
        const missing = item('unknown', NOT_FOUND);
        return { subscriptionLogin: missing, cliConfig: missing, executionMode: missing };
      }
      const version = parseVersion(await run(ctx, path, CLAUDE_VERSION_COMMAND));
      lastCliVersion = version;
      const executionMode = versionItem(version);
      const status = await readAuth(ctx, path);
      const subscriptionLogin = subscriptionLoginItem(status);
      let cliConfig = cliConfigItem(status, await managed());
      // 版本不同：設定隔離（--setting-sources ""）的行為未驗證，失敗結果照實保留，通過改 unknown。
      if (executionMode.outcome !== 'passed' && cliConfig.outcome === 'passed') {
        cliConfig = item('unknown', `${executionMode.basis}；${cliConfig.basis}`);
      }
      return { subscriptionLogin, cliConfig, executionMode };
    },

    async execute(request: ExecuteRequest): Promise<ExecutionResult> {
      lastRun = null;
      if (request.signal?.aborted) {
        return { ok: false, error: { kind: 'cancelled', message: '使用者已取消' } };
      }
      const path = await locate();
      if (!path) return { ok: false, error: { kind: 'other', message: NOT_FOUND } };
      const output = await request.launch({
        executablePath: path,
        command: CLAUDE_RUN_COMMAND,
        model: request.model,
        stdin: request.prompt,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const analysis = analyzeRun(output);
      lastRun = analysis.info;
      return analysis.result;
    },
  };
  return adapter;
}
