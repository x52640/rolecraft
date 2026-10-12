import { sanitizeEnvironment } from '../core/environment.ts';
import { createLauncher } from '../core/process.ts';
import {
  type RunDeps,
  type RunOutcome,
  type RunRequest,
  runWithSubscriptionCheck,
} from '../core/run-check.ts';
import { withEmptyWorkDir } from '../core/workdir.ts';
import { type ClaudeAdapter, type ClaudeAdapterOptions, createClaudeAdapter } from './adapter.ts';
import { parseVersion } from './auth.ts';
import {
  CLAUDE_ENVIRONMENT,
  CLAUDE_VERSION_COMMAND,
  CLAUDE_VERSION_READ_TIMEOUT_MS,
} from './constants.ts';
import { claudeRunDeps } from './guard.ts';
import { findManagedSettings, locateClaude } from './locate.ts';
import { type ReverifyDeps, runClaudeReverification, timeoutLaunch } from './reverify.ts';
import {
  type ClaudeVersionRecord,
  ClaudeVersionGate,
  type ClaudeVersionStore,
  REVERIFYING_REASON,
} from './version-gate.ts';

/**
 * Claude 服務（P1-T039、P1-T062）：適配器＋版本閘門＋自動重新驗證。
 * run()／ensureVersion()：先讀 CLI 版本；已驗證就照常執行；沒有紀錄的版本或上次重新驗證被打斷的版本
 * 先自動重新驗證（期間與一般執行互斥），通過才執行；最後一筆失敗的版本直接擋下（只有 reverify() 能重跑）。無論哪種情況都經 runWithSubscriptionCheck，被擋下時 RunCheckRecord 會寫原因
 * （停用、重新驗證中 → support 無法確認；版本未驗證 → executionMode unknown）。
 * 版本讀不到、保存清單讀不到、有其他執行進行中 → 不重新驗證、不視為已驗證，該次執行被擋下。
 */

export interface ClaudeServiceOptions extends Omit<ClaudeAdapterOptions, 'versionGate'> {
  /** 已驗證版本清單的保存位置（呼叫端注入）；沒給就不做自動重新驗證 */
  readonly store?: ClaudeVersionStore;
}

export type ServiceDeps = RunDeps & Pick<ReverifyDeps, 'makeSandbox'>;

export type EnsureVersionResult =
  | { readonly status: 'ready'; readonly version: string }
  | { readonly status: 'reverified'; readonly record: ClaudeVersionRecord }
  | {
      readonly status: 'blocked';
      readonly reason: string;
      /** 這次觸發的重新驗證紀錄（失敗時） */
      readonly record: ClaudeVersionRecord | null;
    };

/** 使用者按「重新啟用」的結果；not_needed＝目前版本沒有停用也不是未完成，沒有呼叫任何模型。 */
export type ReverifyResult =
  EnsureVersionResult | { readonly status: 'not_needed'; readonly version: string };

export interface ClaudeRunResult {
  readonly outcome: RunOutcome;
  readonly version: EnsureVersionResult;
}

export interface ClaudeService {
  readonly adapter: ClaudeAdapter;
  readonly gate: ClaudeVersionGate;
  ensureVersion(deps: ServiceDeps): Promise<EnsureVersionResult>;
  /**
   * 只讀版本、不重新驗證（P1-T070 自動連線檢查用，0 次模型呼叫）：已驗證回 ready；
   * 停用、未完成、沒有紀錄的版本一律 blocked（重新驗證留給使用者按「重新檢查」或「重新啟用」）。
   */
  observeVersion(deps: ServiceDeps): Promise<EnsureVersionResult>;
  /** 使用者重新啟用：目前版本停用或未完成時，重跑一次注入測試（D24），通過才接受。 */
  reverify(deps: ServiceDeps): Promise<ReverifyResult>;
  run(request: RunRequest, deps: ServiceDeps): Promise<ClaudeRunResult>;
}

export const CANCELLED_BEFORE_VERSION = '使用者已取消，未檢查 Claude CLI 版本';

const blocked = (reason: string, record: ClaudeVersionRecord | null = null) =>
  ({ status: 'blocked', reason, record }) as const;

export function createClaudeService(options: ClaudeServiceOptions = {}): ClaudeService {
  const locate = options.locate ?? (() => locateClaude());
  const managed = options.findManagedSettings ?? (() => findManagedSettings());
  const gate = new ClaudeVersionGate(options.store ?? null);
  const adapter = createClaudeAdapter({ locate, findManagedSettings: managed, versionGate: gate });

  const readVersion = async (path: string, deps: ServiceDeps): Promise<string | null> => {
    try {
      const env = sanitizeEnvironment(deps.parentEnv, CLAUDE_ENVIRONMENT).env;
      return await withEmptyWorkDir(async (cwd) => {
        const launch = createLauncher({
          provider: 'claude',
          env,
          cwd,
          ...(deps.spawn ? { spawn: deps.spawn } : {}),
        });
        // 有執行逾時：卡住的 --version 視為讀不到版本（→ blocked），不讓呼叫端永遠等待。
        const timed = timeoutLaunch(launch, CLAUDE_VERSION_READ_TIMEOUT_MS);
        return parseVersion(await timed({ executablePath: path, command: CLAUDE_VERSION_COMMAND }));
      });
    } catch {
      return null;
    }
  };

  type Located = { readonly storeOk: boolean; readonly path: string; readonly version: string };

  /** 讀保存清單、找 CLI、讀版本（--version 不呼叫模型）並記為目前版本；失敗回 blocked。 */
  const locateVersion = async (deps: ServiceDeps): Promise<Located | EnsureVersionResult> => {
    const storeOk = await gate.load();
    if (gate.state.kind === 'reverifying') return blocked(REVERIFYING_REASON);
    const path = await locate();
    if (!path) return blocked('找不到官方 Claude CLI');
    const version = await readVersion(path, deps);
    if (version === null) return blocked('無法取得 Claude CLI 版本，不視為已驗證');
    gate.observe(version);
    return { storeOk, path, version };
  };

  /** 對這個版本重跑注入測試：先存暫定紀錄（寫不進去就 0 次模型呼叫），再跑、再存結果。 */
  const reverifyNow = async (
    { path, version }: Located,
    deps: ServiceDeps,
  ): Promise<EnsureVersionResult> => {
    if (!gate.beginReverify(version)) {
      return blocked(
        gate.state.kind === 'reverifying'
          ? REVERIFYING_REASON
          : `Claude CLI ${version} 需要重新驗證，但有其他 Claude 執行進行中；請稍後再試`,
      );
    }
    if (!(await gate.saveProvisional(version, deps.now().toISOString()))) {
      const status = gate.statusOf(version);
      return blocked(status.kind === 'failed' ? status.reason : '無法保存驗證狀態');
    }
    let record: ClaudeVersionRecord;
    try {
      record = await runClaudeReverification(
        { executablePath: path, version, locate, findManagedSettings: managed },
        deps,
      );
    } catch (error) {
      const why = error instanceof Error ? error.message : '未知錯誤';
      record = {
        version,
        outcome: 'failed',
        verifiedAt: deps.now().toISOString(),
        cases: [],
        modelCalls: 0,
        reason: `重新驗證發生錯誤：${why}`,
      };
    }
    const final = await gate.finishReverify(record);
    if (final.outcome === 'verified') return { status: 'reverified', record: final };
    const status = gate.statusOf(version);
    return blocked(status.kind === 'failed' ? status.reason : '重新驗證未通過', final);
  };

  const ensureVersion = async (deps: ServiceDeps): Promise<EnsureVersionResult> => {
    const located = await locateVersion(deps);
    if ('status' in located) return located;
    const { storeOk, version } = located;
    const status = gate.statusOf(version);
    if (status.kind === 'accepted') return { status: 'ready', version };
    // 失敗只綁這個版本，不自動重試；要使用者在設定頁重新啟用（D24）。
    if (status.kind === 'failed') return blocked(status.reason);
    if (!storeOk) {
      return blocked(`Claude CLI ${version} 未驗證，且無法讀取已驗證版本清單，不做自動重新驗證`);
    }
    // 沒有紀錄的新版本（D22）或上次被打斷（incomplete，D24）：這次是使用者發起的工作，重跑。
    return reverifyNow(located, deps);
  };

  const observeVersion = async (deps: ServiceDeps): Promise<EnsureVersionResult> => {
    const located = await locateVersion(deps);
    if ('status' in located) return located;
    const { version } = located;
    const status = gate.statusOf(version);
    if (status.kind === 'accepted') return { status: 'ready', version };
    if (status.kind === 'failed' || status.kind === 'incomplete') return blocked(status.reason);
    return blocked(`Claude CLI ${version} 尚未驗證；請到設定頁按「重新檢查」自動重新驗證`);
  };

  const reverify = async (deps: ServiceDeps): Promise<ReverifyResult> => {
    const located = await locateVersion(deps);
    if ('status' in located) return located;
    const status = gate.statusOf(located.version);
    // 只在目前版本停用或未完成時可用；不提供「不測就放行」。
    if (status.kind !== 'failed' && status.kind !== 'incomplete') {
      return { status: 'not_needed', version: located.version };
    }
    if (!located.storeOk) return blocked('無法讀取已驗證版本清單，不做重新驗證');
    return reverifyNow(located, deps);
  };

  return {
    adapter,
    gate,
    ensureVersion,
    observeVersion,
    reverify,
    async run(request, deps) {
      const runDeps = claudeRunDeps(deps, { acceptVersion: gate.isAccepted });
      // 已取消就不讀版本、不觸發重新驗證；交給 runWithSubscriptionCheck 回 cancelled（不啟動子程序）。
      // 使用者的 signal 刻意不傳進重新驗證：取消會被記成驗證失敗而永久停用該服務。
      if (request.signal?.aborted) {
        const outcome = await runWithSubscriptionCheck(adapter, request, runDeps);
        return { outcome, version: blocked(CANCELLED_BEFORE_VERSION) };
      }
      const version = await ensureVersion(deps);
      // 版本被擋時照樣走 runWithSubscriptionCheck：適配器自己的版本判定與閘門會擋下，並留下紀錄。
      const outcome = await runWithSubscriptionCheck(adapter, request, runDeps);
      return { outcome, version };
    },
  };
}
