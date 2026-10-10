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
import { CLAUDE_ENVIRONMENT, CLAUDE_VERSION_COMMAND } from './constants.ts';
import { claudeRunDeps } from './guard.ts';
import { findManagedSettings, locateClaude } from './locate.ts';
import { type ReverifyDeps, runClaudeReverification } from './reverify.ts';
import {
  type ClaudeVersionRecord,
  ClaudeVersionGate,
  type ClaudeVersionStore,
  REVERIFYING_REASON,
} from './version-gate.ts';

/**
 * Claude 服務（P1-T039）：適配器＋版本閘門＋自動重新驗證。
 * run()：先讀 CLI 版本；已驗證就照常執行；未驗證就先自動重新驗證（期間與一般執行互斥），
 * 通過才執行。無論哪種情況都經 runWithSubscriptionCheck，被擋下時 RunCheckRecord 會寫原因
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

export interface ClaudeRunResult {
  readonly outcome: RunOutcome;
  readonly version: EnsureVersionResult;
}

export interface ClaudeService {
  readonly adapter: ClaudeAdapter;
  readonly gate: ClaudeVersionGate;
  ensureVersion(deps: ServiceDeps): Promise<EnsureVersionResult>;
  run(request: RunRequest, deps: ServiceDeps): Promise<ClaudeRunResult>;
}

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
        return parseVersion(
          await launch({ executablePath: path, command: CLAUDE_VERSION_COMMAND }),
        );
      });
    } catch {
      return null;
    }
  };

  const ensureVersion = async (deps: ServiceDeps): Promise<EnsureVersionResult> => {
    const storeOk = await gate.load();
    const state = gate.state;
    if (state.kind === 'disabled') return blocked(state.reason);
    if (state.kind === 'reverifying') return blocked(REVERIFYING_REASON);
    const path = await locate();
    if (!path) return blocked('找不到官方 Claude CLI');
    const version = await readVersion(path, deps);
    if (version === null) return blocked('無法取得 Claude CLI 版本，不視為已驗證');
    if (gate.isAccepted(version)) return { status: 'ready', version };
    if (!storeOk) {
      return blocked(`Claude CLI ${version} 未驗證，且無法讀取已驗證版本清單，不做自動重新驗證`);
    }
    if (!gate.beginReverify(version)) {
      const now = gate.state;
      if (now.kind === 'disabled') return blocked(now.reason);
      return blocked(
        now.kind === 'reverifying'
          ? REVERIFYING_REASON
          : `Claude CLI ${version} 需要重新驗證，但有其他 Claude 執行進行中；請稍後再試`,
      );
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
    return final.outcome === 'verified'
      ? { status: 'reverified', record: final }
      : blocked(final.reason ?? '自動重新驗證未通過', final);
  };

  return {
    adapter,
    gate,
    ensureVersion,
    async run(request, deps) {
      const version = await ensureVersion(deps);
      // 版本被擋時照樣走 runWithSubscriptionCheck：適配器自己的版本判定與閘門會擋下，並留下紀錄。
      const outcome = await runWithSubscriptionCheck(
        adapter,
        request,
        claudeRunDeps(deps, { acceptVersion: gate.isAccepted }),
      );
      return { outcome, version };
    },
  };
}
