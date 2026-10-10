import { type ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import type { SpawnFn } from '../core/process.ts';
import { StreamInspector, type StreamViolation } from './stream.ts';

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
 * 程序群組：stream-json 子程序以 detached 建立（POSIX 上即 setsid，自成一個群組），
 * 終止時對 -pid 送 SIGKILL，連 CLI 開出的工具／hook 孫程序一起終止。
 * 殘餘：core 的取消（AbortSignal）與輸出超量終止仍只對 CLI 本體送訊號（kill 由 core 決定）。
 */

export interface StreamGuardOptions {
  /** 每次終止時通知（記錄用；不含模型文字） */
  readonly onViolation?: (violation: StreamViolation) => void;
}

const guarded = new WeakSet<SpawnFn>();

/** 是否已經是串流守門包過的 spawn（避免重複包裝）。 */
export const isClaudeStreamGuarded = (spawn: SpawnFn | undefined): boolean =>
  spawn !== undefined && guarded.has(spawn);

const isStreamJson = (args: readonly string[]): boolean => {
  const index = args.indexOf('--output-format');
  return index >= 0 && args[index + 1] === 'stream-json';
};

const REKILL_INTERVAL_MS = 25;
const REKILL_LIMIT = 80;

/** 對群組送 SIGKILL；群組已不存在回 false。 */
function signalGroup(pid: number): boolean {
  try {
    process.kill(-pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

/**
 * 終止整個程序群組；沒有 pid（測試假程序）或不支援群組訊號時只終止本體。
 * 送出當下若有程序正在 fork，新程序可能漏接訊號，所以之後每 25ms 再送一次，直到群組消失（最多約 2 秒）。
 */
function killGroup(child: ChildProcess): void {
  const pid = child.pid;
  if (process.platform === 'win32' || typeof pid !== 'number' || !signalGroup(pid)) {
    child.kill('SIGKILL');
    return;
  }
  let rounds = 0;
  const timer = setInterval(() => {
    rounds += 1;
    if (!signalGroup(pid) || rounds >= REKILL_LIMIT) clearInterval(timer);
  }, REKILL_INTERVAL_MS);
  timer.unref();
}

export function createClaudeStreamGuard(
  base: SpawnFn = nodeSpawn,
  options: StreamGuardOptions = {},
): SpawnFn {
  const guard: SpawnFn = (file, args, spawnOptions) => {
    if (!isStreamJson(args)) return base(file, args, spawnOptions);
    const child = base(file, args, { ...spawnOptions, detached: true });
    if (!child.stdout) return child;

    const inspector = new StreamInspector();
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let stopped = false;
    const stop = (violation: StreamViolation) => {
      if (stopped) return;
      stopped = true;
      killGroup(child);
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
  guarded.add(guard);
  return guard;
}

/**
 * Claude 專用 deps 工廠：一律把 spawn 換成串流守門版本（已包過就沿用）。
 * RunDeps、ConnectionDeps 都適用；helper 呼叫 Claude 適配器時只能用這個產生 deps。
 */
export function claudeRunDeps<T extends { readonly spawn?: SpawnFn }>(
  base: T,
  options: StreamGuardOptions = {},
): T & { readonly spawn: SpawnFn } {
  const spawn =
    base.spawn && isClaudeStreamGuarded(base.spawn)
      ? base.spawn
      : createClaudeStreamGuard(base.spawn ?? nodeSpawn, options);
  return { ...base, spawn };
}
