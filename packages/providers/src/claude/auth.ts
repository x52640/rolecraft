import type { CheckOutcome, RunCheckItem } from '@rolecraft/contracts';

import type { ProcessOutput } from '../core/process.ts';
import { CLAUDE_VERIFIED_VERSION } from './constants.ts';

/**
 * `claude auth status --json` 與 `claude --version` 的解讀（ADR-0002 §3 R6-1、§6）。
 * 依據字串只寫判定用的欄位，不寫 email、組織等個資。
 */

export interface AuthStatus {
  readonly loggedIn: boolean | null;
  readonly authMethod: string | null;
  readonly apiProvider: string | null;
  /** 只有改走 API key 時才出現；訂閱登入沒有這個欄位 */
  readonly apiKeySource: string | null;
  readonly subscriptionType: string | null;
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** 解析 auth status。未登入時結束碼是 1 但 stdout 仍是 JSON，所以不看結束碼。 */
export function parseAuthStatus(output: ProcessOutput): AuthStatus | null {
  let data: unknown;
  try {
    data = JSON.parse(output.stdout);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const json = data as Record<string, unknown>;
  return {
    loggedIn: typeof json['loggedIn'] === 'boolean' ? json['loggedIn'] : null,
    authMethod: str(json['authMethod']),
    apiProvider: str(json['apiProvider']),
    apiKeySource: str(json['apiKeySource']),
    subscriptionType: str(json['subscriptionType']),
  };
}

const item = (outcome: CheckOutcome, basis: string): RunCheckItem => ({ outcome, basis });

const describe = (s: AuthStatus): string =>
  `auth status：loggedIn=${String(s.loggedIn)}、authMethod=${String(s.authMethod)}、apiProvider=${String(s.apiProvider)}${s.apiKeySource ? `、apiKeySource=${s.apiKeySource}` : ''}`;

/** R6-1：是否為訂閱登入。 */
export function subscriptionLoginItem(status: AuthStatus | null): RunCheckItem {
  if (!status) return item('unknown', 'auth status 輸出無法解析');
  const basis = describe(status);
  if (status.loggedIn === true && status.authMethod === 'claude.ai') {
    return status.apiProvider === 'firstParty' && !status.apiKeySource
      ? item('passed', basis)
      : item('failed', basis);
  }
  if (status.loggedIn === false) return item('failed', `${basis}（未登入）`);
  if (status.loggedIn === true) return item('failed', `${basis}（不是 claude.ai 訂閱登入）`);
  return item('unknown', basis);
}

/** R6-2：CLI 設定沒有改走 API key 或其他計費供應商；受管設定存在時無法確認。 */
export function cliConfigItem(
  status: AuthStatus | null,
  managedSettingsFound: readonly string[],
): RunCheckItem {
  if (!status) return item('unknown', 'auth status 輸出無法解析');
  if (status.apiKeySource) {
    return item('failed', `CLI 設定改走 API key（apiKeySource=${status.apiKeySource}）`);
  }
  if (status.authMethod !== null && status.authMethod !== 'claude.ai') {
    return item('failed', `CLI 登入方式不是訂閱（authMethod=${status.authMethod}）`);
  }
  if (status.apiProvider !== 'firstParty') {
    return item('failed', `CLI 走其他供應商（apiProvider=${String(status.apiProvider)}）`);
  }
  if (managedSettingsFound.length > 0) {
    return item(
      'unknown',
      `偵測到受管設定（${managedSettingsFound.join('、')}），隔離旗標擋不住，無法確認`,
    );
  }
  return item('passed', 'auth status 無 apiKeySource、走 firstParty；本機沒有受管設定');
}

/** 資格：subscriptionType 有值才算有方案；沒有就未知（不等於沒有）。 */
export function eligibilityOutcome(status: AuthStatus | null): CheckOutcome {
  return status?.subscriptionType ? 'passed' : 'unknown';
}

/**
 * 整行嚴格比對：輸出必須只有一行 `<版本>` 或 `<版本> (Claude Code)`，回傳完整版本字串。
 * 不截短預發布或組建字尾（`2.1.296-beta.1`、`2.1.296.7`、`2.1.296+dev` 原樣回傳），
 * 所以只有與驗證版本完全相同才會通過 versionItem；其他格式回 null（unknown）。
 */
const VERSION_LINE = /^(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)(?: \(Claude Code\))?$/;

export function parseVersion(output: ProcessOutput): string | null {
  if (output.exitCode !== 0) return null;
  const match = VERSION_LINE.exec(output.stdout.replace(/\r?\n$/, ''));
  return match?.[1] ?? null;
}

/** 版本是否為 ADR-0002 驗證版本；不同就是 unknown（不執行），提示重跑 P1-T011 spike。 */
export function versionItem(version: string | null): RunCheckItem {
  if (version === null) return item('unknown', '無法取得 claude 版本');
  if (version !== CLAUDE_VERIFIED_VERSION) {
    return item(
      'unknown',
      `claude ${version} 與 ADR-0002 驗證版本 ${CLAUDE_VERIFIED_VERSION} 不同；旗標行為可能已變，需重跑 P1-T011 spike（scripts/spikes/claude/）`,
    );
  }
  return item(
    'passed',
    `claude ${version}（= ADR-0002 驗證版本）；命令列為固定常數、無禁用旗標（--bare、--settings 等）`,
  );
}
