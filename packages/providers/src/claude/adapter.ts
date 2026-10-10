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
import type { Launch, ProcessOutput } from '../core/process.ts';
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
 * execute 只用該次確認時解析到的 CLI 路徑；沒有確認紀錄或路徑已變就不執行。
 *
 * 呼叫端（helper）規則：runWithSubscriptionCheck／checkConnection 的 deps 只能用
 * claudeRunDeps(base) 產生（guard.ts），才有串流守門的「init 異常立即終止」。
 * 適配器拿不到 spawn，無法自己強制；verifyClaudeModel 內部已強制套用。
 */

export interface ClaudeAdapterOptions {
  /** 找 CLI；預設看固定候選路徑（locateClaude） */
  readonly locate?: () => Promise<string | null>;
  /** 受管設定偵測；預設看 CLAUDE_MANAGED_SETTINGS_PATHS */
  readonly findManagedSettings?: () => Promise<string[]>;
}

export interface ClaudeExecution {
  readonly result: ExecutionResult;
  /** 這次執行的附帶資訊（版本、上下文上限、額度狀態）；不含模型文字 */
  readonly info: ClaudeRunInfo | null;
}

export interface ClaudeAdapter extends ProviderAdapter {
  /** 最近一次 verifySubscriptionRoute 取得的 CLI 版本（除錯用；並行時不保證對應哪一次） */
  readonly lastCliVersion: string | null;
  /**
   * 最近一次 execute 的附帶資訊；只供除錯與手動測試觀察。
   * 並行時會被別次執行覆寫，程式要取每次的資訊請用 executeDetailed 的回傳值。
   */
  readonly lastRun: ClaudeRunInfo | null;
  /** 與 execute 相同，但直接回傳這次的附帶資訊（不經共用狀態） */
  executeDetailed(request: ExecuteRequest): Promise<ClaudeExecution>;
}

const item = (outcome: RunCheckItem['outcome'], basis: string): RunCheckItem => ({
  outcome,
  basis,
});

const NOT_FOUND = '找不到官方 Claude CLI（原生執行檔）';
const NOT_CONFIRMED = '這次執行沒有經過執行前確認（找不到確認時的 CLI 路徑），不執行';
const PATH_CHANGED = 'Claude CLI 路徑在執行前確認之後改變（可能自動更新），不執行；請重新確認';

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): ClaudeAdapter {
  const locate = options.locate ?? (() => locateClaude());
  const managed = options.findManagedSettings ?? (() => findManagedSettings());
  let lastCliVersion: string | null = null;
  let lastRun: ClaudeRunInfo | null = null;
  // 執行前確認時解析到的實際路徑，以該次的 launch 為鍵（core 每次執行建立一個 launch），
  // execute 只用這個路徑，避免「確認 A、執行 B」，並行執行也不互相干擾。
  const confirmedPath = new WeakMap<Launch, string>();

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
      confirmedPath.set(ctx.launch, path);
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
      return (await adapter.executeDetailed(request)).result;
    },

    async executeDetailed(request: ExecuteRequest): Promise<ClaudeExecution> {
      const fail = (message: string): ClaudeExecution => ({
        result: { ok: false, error: { kind: 'other', message } },
        info: null,
      });
      lastRun = null;
      const path = confirmedPath.get(request.launch);
      // 一次確認只給一次執行用
      confirmedPath.delete(request.launch);
      if (request.signal?.aborted) {
        return {
          result: { ok: false, error: { kind: 'cancelled', message: '使用者已取消' } },
          info: null,
        };
      }
      if (!path) return fail(NOT_CONFIRMED);
      const current = await locate();
      if (!current) return fail(NOT_FOUND);
      if (current !== path) return fail(PATH_CHANGED);
      const output = await request.launch({
        executablePath: path,
        command: CLAUDE_RUN_COMMAND,
        model: request.model,
        stdin: request.prompt,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const analysis = analyzeRun(output);
      lastRun = analysis.info;
      return { result: analysis.result, info: analysis.info };
    },
  };
  return adapter;
}
