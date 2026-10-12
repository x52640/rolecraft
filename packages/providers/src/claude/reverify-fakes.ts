import type { SpawnFn } from '../core/process.ts';
import type { RunDeps } from '../core/run-check.ts';
import { fakeClaude, fixture } from './fake-spawn.ts';
import type { ClaudeVersionRecord, ClaudeVersionStore } from './version-gate.ts';

/**
 * 測試專用（不從套件入口匯出）：假 CLI 依工作目錄分流——
 * 誘餌沙箱（rolecraft-claude-live-*）回專案 apiKeyHelper 的 auth status 與注入執行輸出；
 * 其他（空工作目錄）回訂閱 auth status 與正式執行輸出。版本字串可換。
 */

export const withVersion = (jsonl: string, version: string): string =>
  jsonl.replaceAll('"claude_code_version":"2.1.296"', `"claude_code_version":"${version}"`);

export interface VersionedFakeOptions {
  readonly version: string;
  /** 版本指令輸出（預設 `<version> (Claude Code)`） */
  readonly versionStdout?: string;
  readonly injection?: string;
  readonly formal?: string;
  readonly formalExitCode?: number;
  readonly decoyAuth?: string;
  /** 空工作目錄的 auth status（預設訂閱登入） */
  readonly auth?: string;
}

export function versionedFake(options: VersionedFakeOptions) {
  const ok = withVersion(fixture('run-ok.jsonl'), options.version);
  const version = { stdout: options.versionStdout ?? `${options.version} (Claude Code)\n` };
  const empty = fakeClaude({
    version,
    ...(options.auth === undefined ? {} : { auth: { stdout: options.auth } }),
    run: { stdout: options.formal ?? ok, exitCode: options.formalExitCode ?? 0 },
  });
  const decoy = fakeClaude({
    version,
    auth: { stdout: options.decoyAuth ?? fixture('auth-api-key-helper.json') },
    run: { stdout: options.injection ?? ok },
  });
  const spawn: SpawnFn = (file, args, spawnOptions) =>
    String(spawnOptions.cwd).includes('rolecraft-claude-live-')
      ? decoy.spawn(file, args, spawnOptions)
      : empty.spawn(file, args, spawnOptions);
  const calls = () => [...empty.calls, ...decoy.calls];
  return {
    spawn,
    modelCalls: () => calls().filter((c) => c.args[0] === '-p'),
    decoyModelCalls: () => decoy.calls.filter((c) => c.args[0] === '-p'),
    calls,
  };
}

export const runDeps = (spawn: SpawnFn): RunDeps => ({
  parentEnv: { HOME: '/Users/owner', USER: 'owner', ANTHROPIC_API_KEY: 'sk-ant-secret' },
  now: () => new Date('2026-10-10T00:00:00Z'),
  newId: () => 'run-1',
  spawn,
});

export function memoryStore(initial: ClaudeVersionRecord[] = []) {
  const saved: ClaudeVersionRecord[] = [];
  const store: ClaudeVersionStore = {
    load: () => Promise.resolve([...initial]),
    save: (record) => {
      saved.push(record);
      return Promise.resolve();
    },
  };
  return { store, saved };
}
