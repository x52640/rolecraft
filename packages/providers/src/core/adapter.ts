import type { CheckOutcome, Provider, RunCheckItem } from '@rolecraft/contracts';

import type { CommandSpec } from './command.ts';
import type { EnvironmentPolicy } from './environment.ts';
import type { Launch } from './process.ts';

/**
 * 供應商適配介面。三家各自實作（不可假設行為一致）；共同的安全規則由 core 強制：
 * 適配器拿不到原始環境變數，只能透過 core 給的 launch 呼叫 CLI。
 */

/** 支援狀態。不是 supported 的一律不執行，介面顯示對應中文。 */
export type SupportStatus =
  | { readonly state: 'supported' }
  | { readonly state: 'not_supported'; readonly reason: string }
  | { readonly state: 'cannot_confirm'; readonly reason: string };

export const SUPPORT_LABELS = {
  supported: '可用',
  not_supported: '尚未支援',
  cannot_confirm: '無法確認',
} as const satisfies Record<SupportStatus['state'], string>;

/** 錯誤分類：額度用完（依 R9 停止、不重試）／暫時性／其他／使用者取消。 */
export type ProviderErrorKind = 'quota_exhausted' | 'transient' | 'other' | 'cancelled';

export interface ProviderError {
  readonly kind: ProviderErrorKind;
  readonly message: string;
}

/** 執行結果：僅純文字輸出。 */
export type ExecutionResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: ProviderError };

export interface ProbeContext {
  readonly launch: Launch;
  readonly signal?: AbortSignal;
}

export interface InstallationStatus {
  readonly installed: CheckOutcome;
  /** 偵測到的官方 CLI 絕對路徑 */
  readonly executablePath: string | null;
  readonly version: string | null;
}

export interface LoginStatus {
  readonly login: CheckOutcome;
  /** 資格（有可用方案）；官方工具未提供時為 unknown */
  readonly eligibility: CheckOutcome;
}

export interface ModelList {
  readonly outcome: CheckOutcome;
  /** 服務實際提供且帳號可用的模型；不假設所有模型可用 */
  readonly models: readonly string[];
}

/**
 * 適配器自己負責的 R6 項目（環境清理由 core 判定）。
 * D12：不檢查使用者自行開啟的額外用量。
 */
export interface SubscriptionRouteChecks {
  /** R6-1 官方工具回報目前是訂閱登入 */
  readonly subscriptionLogin: RunCheckItem;
  /** R6-2 CLI 設定沒有改走 API key 或其他計費供應商 */
  readonly cliConfig: RunCheckItem;
  /** R6-3 執行模式不會改走 API key、不會自動加購 */
  readonly executionMode: RunCheckItem;
}

export interface ExecuteRequest extends ProbeContext {
  readonly model: string;
  /** 由本機輔助程式組好的完整提示（R5-4）；只能經 stdin 傳給 CLI */
  readonly prompt: string;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  readonly support: SupportStatus;
  /** 子程序環境需求（程式常數） */
  readonly environment: EnvironmentPolicy;
  /** 這個適配器會用到的所有命令；core 會檢查有沒有禁用旗標 */
  readonly commands: readonly CommandSpec[];

  detectInstallation(ctx: ProbeContext): Promise<InstallationStatus>;
  checkLogin(ctx: ProbeContext): Promise<LoginStatus>;
  listModels(ctx: ProbeContext): Promise<ModelList>;
  /** 每次執行前呼叫，不得沿用快取結果 */
  verifySubscriptionRoute(ctx: ProbeContext): Promise<SubscriptionRouteChecks>;
  /** 執行；取消透過 ctx.signal。只在 R6 全部通過後才會被呼叫 */
  execute(request: ExecuteRequest): Promise<ExecutionResult>;
}
