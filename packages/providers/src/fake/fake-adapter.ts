import type { Provider, RunCheckItem } from '@rolecraft/contracts';

import type {
  ExecuteRequest,
  ExecutionResult,
  LoginStatus,
  ModelList,
  ProviderAdapter,
  ProviderErrorKind,
  SubscriptionRouteChecks,
} from '../core/adapter.ts';

/**
 * 供其他套件測試用的假適配器：不啟動任何子程序，依腳本逐次回應。
 * 一律走 core 的 runWithSubscriptionCheck 才能測到 R6 擋下的路徑。
 */

export type FakeStep =
  | { readonly text: string }
  | { readonly error: ProviderErrorKind; readonly message?: string }
  /** 一直等到 signal 取消，回 cancelled */
  | { readonly waitForCancel: true };

export interface FakeAdapterOptions {
  readonly provider?: Provider;
  readonly models?: readonly string[];
  readonly login?: LoginStatus;
  /** 覆寫 R6 項目（預設全部 passed） */
  readonly route?: Partial<SubscriptionRouteChecks>;
  /** verifySubscriptionRoute 直接丟錯 */
  readonly routeThrows?: boolean;
  /** 依序消耗；用完後回 other 錯誤 */
  readonly script?: readonly FakeStep[];
}

export interface FakeCalls {
  readonly prompts: string[];
  readonly models: string[];
  routeChecks: number;
}

export interface FakeAdapter extends ProviderAdapter {
  readonly calls: FakeCalls;
}

const PASSED: RunCheckItem = { outcome: 'passed', basis: 'fake：假定通過' };

function waitForAbort(signal: AbortSignal | undefined): Promise<ExecutionResult> {
  const cancelled: ExecutionResult = {
    ok: false,
    error: { kind: 'cancelled', message: '使用者已取消' },
  };
  if (!signal)
    return Promise.resolve({ ok: false, error: { kind: 'other', message: '沒有取消訊號' } });
  if (signal.aborted) return Promise.resolve(cancelled);
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(cancelled), { once: true });
  });
}

export function createFakeAdapter(options: FakeAdapterOptions = {}): FakeAdapter {
  const models = options.models ?? ['fake-model'];
  const script = [...(options.script ?? [])];
  const calls: FakeCalls = { prompts: [], models: [], routeChecks: 0 };
  const listed: ModelList = { outcome: 'passed', models };

  return {
    provider: options.provider ?? 'claude',
    support: { state: 'supported' },
    environment: {},
    commands: [],
    calls,
    detectInstallation: () =>
      Promise.resolve({ installed: 'passed', executablePath: '/fake/bin/cli', version: '0.0.0' }),
    checkLogin: () => Promise.resolve(options.login ?? { login: 'passed', eligibility: 'passed' }),
    listModels: () => Promise.resolve(listed),
    verifySubscriptionRoute: () => {
      calls.routeChecks += 1;
      if (options.routeThrows) return Promise.reject(new Error('fake：確認失敗'));
      return Promise.resolve({
        subscriptionLogin: PASSED,
        cliConfig: PASSED,
        executionMode: PASSED,
        ...options.route,
      });
    },
    execute: (request: ExecuteRequest) => {
      calls.prompts.push(request.prompt);
      calls.models.push(request.model);
      const step = script.shift();
      if (!step) {
        return Promise.resolve({ ok: false, error: { kind: 'other', message: 'fake 腳本已用完' } });
      }
      if ('text' in step) return Promise.resolve({ ok: true, text: step.text });
      if ('error' in step) {
        return Promise.resolve({
          ok: false,
          error: { kind: step.error, message: step.message ?? `fake：${step.error}` },
        });
      }
      return waitForAbort(request.signal);
    },
  };
}
