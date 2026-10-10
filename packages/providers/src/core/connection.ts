import { type CheckOutcome, ProviderConnection } from '@rolecraft/contracts';

import type { InstallationStatus, LoginStatus, ModelList, ProviderAdapter } from './adapter.ts';
import { type ParentEnv, sanitizeEnvironment } from './environment.ts';
import { createLauncher, type SpawnFn } from './process.ts';
import { routeChecks, summarizeChecks } from './run-check.ts';
import { withEmptyWorkDir } from './workdir.ts';

/**
 * 安裝精靈用的連接檢查（F01）。結果只供顯示與選擇模型，
 * **不能**拿來跳過執行前的 R6 確認（runWithSubscriptionCheck 每次都重查）。
 */

export interface ConnectionDeps {
  readonly parentEnv: ParentEnv;
  readonly now: () => Date;
  readonly spawn?: SpawnFn;
  readonly signal?: AbortSignal;
}

export interface ConnectionReport {
  readonly installation: InstallationStatus;
  readonly connection: ProviderConnection;
}

const UNKNOWN_INSTALL: InstallationStatus = {
  installed: 'unknown',
  executablePath: null,
  version: null,
};
const UNKNOWN_LOGIN: LoginStatus = { login: 'unknown', eligibility: 'unknown' };
const UNKNOWN_MODELS: ModelList = { outcome: 'unknown', models: [] };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function checkConnection(
  adapter: ProviderAdapter,
  deps: ConnectionDeps,
): Promise<ConnectionReport> {
  const checkedAt = deps.now().toISOString();
  const report = (
    installation: InstallationStatus,
    login: LoginStatus,
    models: ModelList,
    subscriptionOnly: CheckOutcome,
  ): ConnectionReport => ({
    installation,
    connection: ProviderConnection.parse({
      provider: adapter.provider,
      login: login.login,
      eligibility: login.eligibility,
      availableModels: models.outcome === 'passed' ? [...models.models] : [],
      subscriptionOnly,
      checkedAt,
    }),
  });
  const unknown = () => report(UNKNOWN_INSTALL, UNKNOWN_LOGIN, UNKNOWN_MODELS, 'unknown');

  if (adapter.support.state !== 'supported') return unknown();
  let env;
  try {
    env = sanitizeEnvironment(deps.parentEnv, adapter.environment).env;
  } catch {
    return unknown();
  }

  return withEmptyWorkDir(async (cwd) => {
    const launch = createLauncher({
      provider: adapter.provider,
      env,
      cwd,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    });
    const ctx = deps.signal ? { launch, signal: deps.signal } : { launch };
    const installation = await safe(() => adapter.detectInstallation(ctx), UNKNOWN_INSTALL);
    if (installation.installed !== 'passed') {
      return report(installation, UNKNOWN_LOGIN, UNKNOWN_MODELS, 'unknown');
    }
    const login = await safe(() => adapter.checkLogin(ctx), UNKNOWN_LOGIN);
    const models = await safe(() => adapter.listModels(ctx), UNKNOWN_MODELS);
    const route = await routeChecks(adapter, launch, deps.signal);
    const subscriptionOnly = summarizeChecks({
      ...route.checks,
      environmentSanitized: { outcome: 'passed', basis: '子程序環境已清理' },
    });
    return report(installation, login, models, subscriptionOnly);
  });
}
