import type { CommandSpec } from '../core/command.ts';
import { type ParentEnv, sanitizeEnvironment } from '../core/environment.ts';
import { createLauncher, type Launch, type ProcessOutput, type SpawnFn } from '../core/process.ts';
import { withEmptyWorkDir } from '../core/workdir.ts';
import { cliConfigItem, parseAuthStatus, parseVersion, subscriptionLoginItem } from './auth.ts';
import {
  CLAUDE_AUTH_STATUS_COMMAND,
  CLAUDE_ENVIRONMENT,
  CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS,
  CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS,
  CLAUDE_RUN_COMMAND,
  CLAUDE_VERSION_COMMAND,
} from './constants.ts';
import { claudeRunDeps } from './guard.ts';
import { CANARIES, type InjectionSandbox, makeInjectionSandbox } from './injection-sandbox.ts';
import { evaluateFormalRun, evaluateInjectionRun } from './reverify-cases.ts';
import type { ClaudeVersionRecord, ReverifyCaseResult } from './version-gate.ts';

/**
 * Claude CLI 自動重新驗證（plan.md D22、P1-T039）。對一個未驗證的 CLI 版本重跑 S9-13：
 *   1. version-confirm         再讀一次 --version，必須就是要驗證的版本
 *   2. auth-subscription       空工作目錄 auth status：訂閱登入、無 apiKeySource、無受管設定
 *   3. auth-detects-helper     誘餌工作目錄 auth status：必須抓到專案設定的 apiKeyHelper（偵測仍有效）
 *   4. 注入執行（模型呼叫 1）  誘餌工作目錄＋注入提示 → reverify-cases 拆成各案例
 *   5. formal-run（模型呼叫 2）空工作目錄＋極短提示，必須成功
 *   6. version-stable          結束時版本與 CLI 路徑都沒變
 * 命令列、環境、串流守門與正式執行完全相同（ADR-0002 隔離旗標，不加任何旗標）。
 * 任一案例失敗就停止（不跑後面的、不重試）；結果不確定（額度、逾時、錯誤、取消）也是失敗。
 * 模型呼叫有硬上限 CLAUDE_REVERIFY_MAX_MODEL_CALLS，超過直接拒絕啟動子程序。
 * 每次啟動有執行逾時 CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS，逾時終止行程群組並記為失敗。
 */

/** 每次重新驗證最多呼叫模型幾次（D22：約 3–5 次；本流程實際用 2 次）。 */
export const CLAUDE_REVERIFY_MAX_MODEL_CALLS = 3;

/** 重新驗證只用最便宜的模型。 */
export const CLAUDE_REVERIFY_MODEL = 'haiku';

export const CLAUDE_REVERIFY_FORMAL_PROMPT = '只回覆 OK 兩個字母。';

export interface ReverifyTarget {
  /** 已解析的 CLI 實際路徑（整個重新驗證只用這一個） */
  readonly executablePath: string;
  /** 要驗證的版本 */
  readonly version: string;
  readonly locate: () => Promise<string | null>;
  readonly findManagedSettings: () => Promise<string[]>;
}

export interface ReverifyDeps {
  readonly parentEnv: ParentEnv;
  readonly now: () => Date;
  /** 原始 spawn（測試替換）；內部一律套串流守門，只接受要驗證的版本 */
  readonly spawn?: SpawnFn;
  /** 測試用：替換注入沙箱 */
  readonly makeSandbox?: () => Promise<InjectionSandbox>;
}

export class ReverifyBudgetError extends Error {
  override readonly name = 'ReverifyBudgetError';
}

/** 包住 launch：模型呼叫（正式執行命令）超過上限就拒絕，不啟動子程序。 */
export function budgetLaunch(
  launch: Launch,
  counter: { modelCalls: number },
  max: number = CLAUDE_REVERIFY_MAX_MODEL_CALLS,
): Launch {
  return (request) => {
    if (request.command === CLAUDE_RUN_COMMAND) {
      if (counter.modelCalls >= max) {
        return Promise.reject(new ReverifyBudgetError(`模型呼叫已達上限 ${max} 次`));
      }
      counter.modelCalls += 1;
    }
    return launch(request);
  };
}

export class ReverifyTimeoutError extends Error {
  override readonly name = 'ReverifyTimeoutError';
}

/**
 * 包住 launch：每次啟動各自一個逾時；逾時就中止（launcher 終止整個行程群組）並拋錯。
 * 中止後最多再等 hardExtraMs：子程序的 close 可能永遠不來（逃出群組的孫行程握著 stdout），
 * 超過就不再等 launch、直接拋 ReverifyTimeoutError，呼叫端不會卡住。
 */
export function timeoutLaunch(
  launch: Launch,
  ms: number = CLAUDE_REVERIFY_LAUNCH_TIMEOUT_MS,
  hardExtraMs: number = CLAUDE_LAUNCH_HARD_DEADLINE_EXTRA_MS,
): Launch {
  return async (request) => {
    const controller = new AbortController();
    const timeoutError = () => new ReverifyTimeoutError(`單次執行超過 ${ms} 毫秒未結束，已終止`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        hardTimer = setTimeout(() => reject(timeoutError()), hardExtraMs);
      }, ms);
    });
    try {
      const output = await Promise.race([
        launch({ ...request, signal: controller.signal }),
        deadline,
      ]);
      if (controller.signal.aborted) throw timeoutError();
      return output;
    } finally {
      clearTimeout(timer);
      clearTimeout(hardTimer);
    }
  };
}

class CaseFailed extends Error {}

export async function runClaudeReverification(
  target: ReverifyTarget,
  deps: ReverifyDeps,
): Promise<ClaudeVersionRecord> {
  const counter = { modelCalls: 0 };
  const cases: ReverifyCaseResult[] = [];
  const record = (reason?: string): ClaudeVersionRecord => ({
    version: target.version,
    outcome: reason === undefined ? 'verified' : 'failed',
    verifiedAt: deps.now().toISOString(),
    cases: [...cases],
    modelCalls: counter.modelCalls,
    ...(reason === undefined ? {} : { reason }),
  });
  const add = (...results: ReverifyCaseResult[]) => {
    cases.push(...results);
    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      throw new CaseFailed(failed.map((r) => `${r.id}：${r.detail}`).join('；'));
    }
  };

  let sandbox: InjectionSandbox | null = null;
  try {
    const env = sanitizeEnvironment(deps.parentEnv, CLAUDE_ENVIRONMENT).env;
    const { spawn } = claudeRunDeps(deps.spawn ? { spawn: deps.spawn } : {}, {
      acceptVersion: (v) => v === target.version,
    });
    const launcherAt = (cwd: string) =>
      budgetLaunch(timeoutLaunch(createLauncher({ provider: 'claude', env, cwd, spawn })), counter);
    const call = (launch: Launch, command: CommandSpec, stdin?: string) =>
      launch({
        executablePath: target.executablePath,
        command,
        ...(command === CLAUDE_RUN_COMMAND ? { model: CLAUDE_REVERIFY_MODEL } : {}),
        ...(stdin === undefined ? {} : { stdin }),
      });
    const versionCase = (id: string, out: ProcessOutput, path: string | null) => {
      const seen = parseVersion(out);
      return seen === target.version && path === target.executablePath
        ? { id, passed: true, detail: `版本 ${seen}、路徑未變` }
        : {
            id,
            passed: false,
            detail: `版本 ${String(seen)}、路徑${path === target.executablePath ? '未變' : '已變'}`,
          };
    };

    await withEmptyWorkDir(async (empty) => {
      const emptyLaunch = launcherAt(empty);
      add(
        versionCase(
          'version-confirm',
          await call(emptyLaunch, CLAUDE_VERSION_COMMAND),
          await target.locate(),
        ),
      );

      const auth = parseAuthStatus(await call(emptyLaunch, CLAUDE_AUTH_STATUS_COMMAND));
      const login = subscriptionLoginItem(auth);
      const config = cliConfigItem(auth, await target.findManagedSettings());
      add({
        id: 'auth-subscription',
        passed: login.outcome === 'passed' && config.outcome === 'passed',
        detail: `${login.basis}；${config.basis}`,
      });

      sandbox = await (deps.makeSandbox ?? makeInjectionSandbox)();
      const work = launcherAt(sandbox.work);
      const decoyAuth = parseAuthStatus(await call(work, CLAUDE_AUTH_STATUS_COMMAND));
      add({
        id: 'auth-detects-helper',
        passed: decoyAuth?.apiKeySource != null,
        detail: decoyAuth?.apiKeySource
          ? `誘餌目錄 auth status 抓到 apiKeySource=${decoyAuth.apiKeySource}`
          : '誘餌目錄 auth status 沒有抓到專案 apiKeyHelper（偵測可能失效）',
      });

      const injected = await call(work, CLAUDE_RUN_COMMAND, sandbox.prompt);
      add(
        ...evaluateInjectionRun({
          output: injected,
          version: target.version,
          canariesFound: sandbox.findCanaries(`${injected.stdout}\n${injected.stderr}`),
          secretCanary: CANARIES.secret,
          markers: await sandbox.listMarkers(),
        }),
      );

      const formal = await call(emptyLaunch, CLAUDE_RUN_COMMAND, CLAUDE_REVERIFY_FORMAL_PROMPT);
      add(evaluateFormalRun(formal, target.version));

      add(
        versionCase(
          'version-stable',
          await call(emptyLaunch, CLAUDE_VERSION_COMMAND),
          await target.locate(),
        ),
      );
    });
    return record();
  } catch (error) {
    if (error instanceof CaseFailed) return record(error.message);
    const why = error instanceof Error ? `${error.name}: ${error.message}` : '未知錯誤';
    return record(`重新驗證途中發生錯誤：${why}`);
  } finally {
    await (sandbox as InjectionSandbox | null)?.dispose();
  }
}
