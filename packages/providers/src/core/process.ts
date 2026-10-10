import { type ChildProcess, spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';

import type { Provider } from '@rolecraft/contracts';

import {
  assertExecutablePath,
  buildArgv,
  CommandPolicyError,
  type CommandSpec,
  findApiKeyModeFlags,
} from './command.ts';
import { findBillingEnvNames } from './environment.ts';
import { killProcessGroup, signalProcessGroup } from './kill.ts';

/**
 * 子程序啟動器。適配器拿不到環境變數與工作目錄，只能透過這個已綁定好
 * 「清理後環境＋空暫存工作目錄」的 launch 呼叫官方 CLI。
 * 一律 `shell: false`：參數陣列直接交給作業系統，不經 shell 解讀。
 *
 * 終止：子程序以 detached 建立（自成程序群組）。取消時先對整個群組送 SIGTERM，
 * 寬限期內沒結束就 SIGKILL 整個群組；輸出超量直接 SIGKILL 整個群組。
 * 所以 CLI 忽略 SIGTERM 或留下孫程序時，取消仍會在寬限期後完成。
 */

export interface LaunchRequest {
  /** 偵測到的官方 CLI 絕對路徑 */
  readonly executablePath: string;
  readonly command: CommandSpec;
  /** 替換 MODEL_SLOT 的模型 ID */
  readonly model?: string;
  /** 純文字輸入（提示），只走 stdin */
  readonly stdin?: string;
  readonly signal?: AbortSignal;
}

export interface ProcessOutput {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** 因取消而終止 */
  readonly aborted: boolean;
  /** 輸出超過上限而被終止 */
  readonly truncated: boolean;
}

export type Launch = (request: LaunchRequest) => Promise<ProcessOutput>;

/** node:child_process.spawn 的最小形狀，測試可替換。 */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface LauncherOptions {
  readonly provider: Provider;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  readonly maxOutputBytes?: number;
  /** 取消後等子程序自行結束的寬限期，逾時改送 SIGKILL */
  readonly terminateGraceMs?: number;
  readonly spawn?: SpawnFn;
}

const DEFAULT_MAX_OUTPUT = 8 * 1024 * 1024;
const DEFAULT_TERMINATE_GRACE_MS = 2000;

export function createLauncher(options: LauncherOptions): Launch {
  const leaked = findBillingEnvNames(options.env);
  if (leaked.length > 0) {
    throw new CommandPolicyError(`子程序環境殘留計費變數：${leaked.join(', ')}`);
  }
  const spawn = options.spawn ?? nodeSpawn;
  const max = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const grace = options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS;

  return async (request) => {
    assertExecutablePath(request.executablePath);
    const forbidden = findApiKeyModeFlags(options.provider, request.command);
    if (forbidden.length > 0) {
      throw new CommandPolicyError(`禁用會改走 API key 的執行模式：${forbidden.join(', ')}`);
    }
    const argv = buildArgv(request.command, request.model);
    const signal = request.signal;

    return await new Promise<ProcessOutput>((resolve, reject) => {
      // 不把 signal 交給 spawn：Node 只會送一次 SIGTERM 給本體，子程序忽略就永遠不結束。
      const child = spawn(request.executablePath, argv, {
        shell: false,
        env: { ...options.env },
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: true,
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      let truncated = false;
      const collect = (sink: Buffer[]) => (chunk: Buffer) => {
        size += chunk.length;
        if (size > max) {
          if (!truncated) killProcessGroup(child);
          truncated = true;
          return;
        }
        sink.push(chunk);
      };
      child.stdout?.on('data', collect(out));
      child.stderr?.on('data', collect(err));
      child.stdin?.on('error', () => {
        // 子程序提早結束時寫入 stdin 會 EPIPE；結果以 close 事件為準。
      });

      let aborted = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (aborted) return;
        aborted = true;
        signalProcessGroup(child, 'SIGTERM');
        graceTimer = setTimeout(() => killProcessGroup(child), grace);
      };
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        if (graceTimer) clearTimeout(graceTimer);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });

      child.on('error', (error) => {
        cleanup();
        reject(error);
      });
      child.on('close', (code) => {
        cleanup();
        resolve({
          exitCode: code,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          aborted,
          truncated,
        });
      });
      child.stdin?.end(request.stdin ?? '');
    });
  };
}
