import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import type { SpawnFn } from '../core/process.ts';

/**
 * 測試專用：用錄製的 CLI 輸出（fixtures/）假裝成 claude 子程序。不從套件入口匯出。
 * 串流逐行非同步送出，被 kill 後停止送出並以 exitCode null 結束（模擬 SIGKILL）。
 */

const FIXTURES = join(import.meta.dirname, 'fixtures');

export const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

export interface FakeReply {
  readonly stdout: string;
  readonly exitCode?: number;
}

export interface FakeClaude {
  readonly spawn: SpawnFn;
  readonly calls: { args: readonly string[]; stdin: string; env: Record<string, string> }[];
  /** 送出（含被 kill 前）的串流行數 */
  emittedLines: number;
  killed: boolean;
}

export interface FakeClaudeScript {
  readonly version?: FakeReply;
  readonly auth?: FakeReply;
  readonly run?: FakeReply;
}

export function fakeClaude(script: FakeClaudeScript): FakeClaude {
  const state: FakeClaude = {
    calls: [],
    emittedLines: 0,
    killed: false,
    spawn: (_file, args, options) => {
      const child = new EventEmitter() as ChildProcess & EventEmitter;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stdin = new PassThrough();
      const call = { args, stdin: '', env: { ...(options.env as Record<string, string>) } };
      state.calls.push(call);
      stdin.on('data', (chunk: Buffer) => (call.stdin += chunk.toString()));
      let killed = false;
      Object.assign(child, {
        stdout,
        stderr,
        stdin,
        kill: () => {
          killed = true;
          state.killed = true;
          return true;
        },
      });
      const reply =
        args[0] === '--version'
          ? (script.version ?? { stdout: '2.1.296 (Claude Code)\n' })
          : args[0] === 'auth'
            ? (script.auth ?? { stdout: fixture('auth-subscription.json') })
            : (script.run ?? { stdout: fixture('run-ok.jsonl') });
      const lines = reply.stdout.split(/(?<=\n)/);
      const finish = (code: number | null) => {
        stdout.end();
        stderr.end();
        setImmediate(() => child.emit('close', code));
      };
      const step = (index: number) => {
        if (killed) return finish(null);
        const line = lines[index];
        if (line === undefined) return finish(reply.exitCode ?? 0);
        state.emittedLines += 1;
        stdout.write(line);
        setImmediate(() => step(index + 1));
      };
      setImmediate(() => step(0));
      return child;
    },
  };
  return state;
}
