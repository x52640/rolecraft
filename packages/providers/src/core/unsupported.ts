import type { Provider } from '@rolecraft/contracts';

import type { ProviderAdapter } from './adapter.ts';

/**
 * 「尚未支援／無法確認」的適配器（providers.md S8、R5）。
 * 任何檢查都回 unknown、從不執行；core 也會因 support 不是 supported 而先擋下。
 */
export function createUnsupportedAdapter(
  provider: Provider,
  state: 'not_supported' | 'cannot_confirm',
  reason: string,
): ProviderAdapter {
  const basis = `${state === 'not_supported' ? '尚未支援' : '無法確認'}：${reason}`;
  const unknown = { outcome: 'unknown', basis } as const;
  return {
    provider,
    support: { state, reason },
    environment: {},
    commands: [],
    detectInstallation: () =>
      Promise.resolve({ installed: 'unknown', executablePath: null, version: null }),
    checkLogin: () => Promise.resolve({ login: 'unknown', eligibility: 'unknown' }),
    listModels: () => Promise.resolve({ outcome: 'unknown', models: [] }),
    verifySubscriptionRoute: () =>
      Promise.resolve({ subscriptionLogin: unknown, cliConfig: unknown, executionMode: unknown }),
    execute: () => Promise.resolve({ ok: false, error: { kind: 'other', message: basis } }),
  };
}
