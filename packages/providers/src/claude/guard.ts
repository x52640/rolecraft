import { spawn as nodeSpawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import { killProcessGroup } from '../core/kill.ts';
import type { SpawnFn } from '../core/process.ts';
import { type AcceptVersion, StreamInspector, type StreamViolation } from './stream.ts';

/**
 * 執行中串流守門：包住 spawn，在 stream-json 子程序的 stdout 上加一個逐行檢查器，
 * 一看到 init 異常、工具呼叫事件或額度拒絕，立刻 SIGKILL 子程序所在的整個程序群組（ADR-0002 §6）。
 *
 * 為什麼包 spawn：core 的 launch 只在子程序結束後才回傳整段輸出，適配器看不到串流；
 * 包 spawn 不必改 core（RunDeps／ConnectionDeps 都接受 spawn）。
 * Claude 的執行路徑一律用 claudeRunDeps(base) 產生 deps（verifyClaudeModel 內部也強制套用），
 * 不要把未包裝的 spawn 直接交給 runWithSubscriptionCheck／checkConnection。
 * 結束後 analyzeRun 會用同一份檢查器再判一次並丟棄輸出，所以就算漏接守門，違規輸出也不會被採用，
 * 只是無法「立即」終止。
 *
 * 程序群組：core 的 launcher 一律以 detached 建立子程序（這裡也明確帶上），
 * 終止時用 core 的 killProcessGroup 對整個群組送 SIGKILL，連 CLI 開出的工具／hook 孫程序一起終止；
 * core 的取消與輸出超量終止走同一套群組終止。
 */

export interface StreamGuardOptions {
  /** 每次終止時通知（記錄用；不含模型文字） */
  readonly onViolation?: (violation: StreamViolation) => void;
  /** init 接受的 CLI 版本；預設只有 ADR-0002 驗證版本（P1-T039 重新驗證過的版本由呼叫端傳入） */
  readonly acceptVersion?: AcceptVersion;
}

/** 守門版 spawn → 被包住的原始 spawn（換版本判定時從原始 spawn 重包，不疊兩層守門）。 */
const guarded = new WeakMap<SpawnFn, SpawnFn>();

/** 是否已經是串流守門包過的 spawn（避免重複包裝）。 */
export const isClaudeStreamGuarded = (spawn: SpawnFn | undefined): boolean =>
  spawn !== undefined && guarded.has(spawn);

const isStreamJson = (args: readonly string[]): boolean => {
  const index = args.indexOf('--output-format');
  return index >= 0 && args[index + 1] === 'stream-json';
};

export function createClaudeStreamGuard(
  base: SpawnFn = nodeSpawn,
  options: StreamGuardOptions = {},
): SpawnFn {
  const guard: SpawnFn = (file, args, spawnOptions) => {
    if (!isStreamJson(args)) return base(file, args, spawnOptions);
    const child = base(file, args, { ...spawnOptions, detached: true });
    if (!child.stdout) return child;

    const inspector = new StreamInspector(options.acceptVersion);
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let stopped = false;
    const stop = (violation: StreamViolation) => {
      if (stopped) return;
      stopped = true;
      killProcessGroup(child);
      options.onViolation?.(violation);
    };
    // 在 core 掛上收集器之前先掛（同一個同步區段內），所以每個 chunk 都先經過檢查。
    child.stdout.on('data', (chunk: Buffer | string) => {
      if (stopped) return;
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        const violation = inspector.push(line);
        if (violation) {
          stop(violation);
          return;
        }
        newline = pending.indexOf('\n');
      }
    });
    return child;
  };
  guarded.set(guard, base);
  return guard;
}

/**
 * Claude 專用 deps 工廠：一律把 spawn 換成串流守門版本。
 * 沒給 options 時已包過就沿用；有給 options（例：acceptVersion）就從原始 spawn 重包，
 * 確保用的是這次指定的判定。RunDeps、ConnectionDeps 都適用；helper 只能用這個產生 deps。
 */
export function claudeRunDeps<T extends { readonly spawn?: SpawnFn }>(
  base: T,
  options?: StreamGuardOptions,
): T & { readonly spawn: SpawnFn } {
  const raw = base.spawn ? (guarded.get(base.spawn) ?? base.spawn) : nodeSpawn;
  const spawn =
    options === undefined && base.spawn && isClaudeStreamGuarded(base.spawn)
      ? base.spawn
      : createClaudeStreamGuard(raw, options);
  return { ...base, spawn };
}
