import { spawn as nodeSpawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import type { SpawnFn } from '../core/process.ts';
import { StreamInspector, type StreamViolation } from './stream.ts';

/**
 * 執行中串流守門：包住 spawn，在 stream-json 子程序的 stdout 上加一個逐行檢查器，
 * 一看到 init 異常、工具呼叫事件或額度拒絕，立刻 SIGKILL 子程序（ADR-0002 §6）。
 *
 * 為什麼包 spawn：core 的 launch 只在子程序結束後才回傳整段輸出，適配器看不到串流；
 * 包 spawn 不必改 core（RunDeps／ConnectionDeps 都接受 spawn）。結束後 analyzeRun 會用同一份
 * 檢查器再判一次並丟棄輸出，所以就算沒接上守門，違規輸出也不會被採用，只是無法「立即」終止。
 */

export interface StreamGuardOptions {
  /** 每次終止時通知（記錄用；不含模型文字） */
  readonly onViolation?: (violation: StreamViolation) => void;
}

const isStreamJson = (args: readonly string[]): boolean => {
  const index = args.indexOf('--output-format');
  return index >= 0 && args[index + 1] === 'stream-json';
};

export function createClaudeStreamGuard(
  base: SpawnFn = nodeSpawn,
  options: StreamGuardOptions = {},
): SpawnFn {
  return (file, args, spawnOptions) => {
    const child = base(file, args, spawnOptions);
    if (!isStreamJson(args) || !child.stdout) return child;

    const inspector = new StreamInspector();
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let stopped = false;
    const stop = (violation: StreamViolation) => {
      if (stopped) return;
      stopped = true;
      child.kill('SIGKILL');
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
}
