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

/**
 * 子程序啟動器。適配器拿不到環境變數與工作目錄，只能透過這個已綁定好
 * 「清理後環境＋空暫存工作目錄」的 launch 呼叫官方 CLI。
 * 一律 `shell: false`：參數陣列直接交給作業系統，不經 shell 解讀。
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
  readonly spawn?: SpawnFn;
}

const DEFAULT_MAX_OUTPUT = 8 * 1024 * 1024;

export function createLauncher(options: LauncherOptions): Launch {
  const leaked = findBillingEnvNames(options.env);
  if (leaked.length > 0) {
    throw new CommandPolicyError(`子程序環境殘留計費變數：${leaked.join(', ')}`);
  }
  const spawn = options.spawn ?? nodeSpawn;
  const max = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;

  return async (request) => {
    assertExecutablePath(request.executablePath);
    const forbidden = findApiKeyModeFlags(options.provider, request.command);
    if (forbidden.length > 0) {
      throw new CommandPolicyError(`禁用會改走 API key 的執行模式：${forbidden.join(', ')}`);
    }
    const argv = buildArgv(request.command, request.model);

    return await new Promise<ProcessOutput>((resolve, reject) => {
      const child = spawn(request.executablePath, argv, {
        shell: false,
        env: { ...options.env },
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      let truncated = false;
      const collect = (sink: Buffer[]) => (chunk: Buffer) => {
        size += chunk.length;
        if (size > max) {
          truncated = true;
          child.kill('SIGKILL');
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
      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.name === 'AbortError') {
          aborted = true;
          return;
        }
        reject(error);
      });
      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          aborted: aborted || (request.signal?.aborted ?? false),
          truncated,
        });
      });
      child.stdin?.end(request.stdin ?? '');
    });
  };
}
