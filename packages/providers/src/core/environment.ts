import { isBillingEnvName } from './billing-env.ts';

/**
 * 子程序環境清理（R6-2）。
 *
 * 做法是「白名單＋黑名單」：只從父程序環境帶出白名單內的變數，其餘一律不傳；
 * 白名單（含各家適配器追加的）與適配器自設的值，再過一次計費黑名單，黑名單永遠優先。
 */

/** 子程序執行一般 CLI 需要、且與計費無關的變數（名稱大小寫須完全相同）。 */
export const BASE_ENV_ALLOWLIST: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'TMPDIR',
  'TZ',
  'TERM',
  'NO_COLOR',
  '__CF_USER_TEXT_ENCODING',
];

/** 適配器對環境的要求；全部必須是程式常數。 */
export interface EnvironmentPolicy {
  /** 額外從父程序帶出的變數名稱（例如該 CLI 的設定目錄變數） */
  readonly allow?: readonly string[];
  /** 子程序固定設定的值（例如把 CLI 設定目錄指到隔離資料夾） */
  readonly set?: Readonly<Record<string, string>>;
}

export type ParentEnv = Readonly<Record<string, string | undefined>>;

export interface SanitizedEnvironment {
  readonly env: Readonly<Record<string, string>>;
  /** 從父程序環境移除的計費相關變數名稱（只有名稱，不含值） */
  readonly removedBillingNames: readonly string[];
  /** 因不在白名單而未帶出的其他變數數量（不記名稱，避免紀錄洩漏使用者環境） */
  readonly droppedOtherCount: number;
}

/** 適配器政策本身違反黑名單（程式錯誤，不是使用者環境問題）。 */
export class EnvironmentPolicyError extends Error {
  override readonly name = 'EnvironmentPolicyError';
}

/** 產生子程序環境。適配器政策若試圖放行或設定計費變數，直接丟錯。 */
export function sanitizeEnvironment(
  parent: ParentEnv,
  policy: EnvironmentPolicy = {},
): SanitizedEnvironment {
  const allow = new Set([...BASE_ENV_ALLOWLIST, ...(policy.allow ?? [])]);
  const set = policy.set ?? {};
  for (const name of [...(policy.allow ?? []), ...Object.keys(set)]) {
    if (isBillingEnvName(name)) {
      throw new EnvironmentPolicyError(`適配器不得放行或設定計費相關變數：${name}`);
    }
  }

  const env: Record<string, string> = {};
  const removedBillingNames: string[] = [];
  let droppedOtherCount = 0;
  for (const [name, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (isBillingEnvName(name)) {
      removedBillingNames.push(name);
    } else if (allow.has(name)) {
      env[name] = value;
    } else {
      droppedOtherCount += 1;
    }
  }
  for (const [name, value] of Object.entries(set)) env[name] = value;

  removedBillingNames.sort();
  return { env: Object.freeze(env), removedBillingNames, droppedOtherCount };
}

/** 事後驗證：環境內不得殘留任何計費相關變數。回傳殘留的名稱。 */
export function findBillingEnvNames(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(env).filter(isBillingEnvName);
}
