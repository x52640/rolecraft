import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { createClaudeService, type RunDeps } from '@rolecraft/providers';
import { describe, expect, it, vi } from 'vitest';

import { CLAUDE_MODEL_VERIFY_TIMEOUT_MS, createClaudeProbe } from './claude-probe.ts';
import { createProvidersService } from './providers-service.ts';

/**
 * 用假 spawn 跑 @rolecraft/providers 的真實檢查路徑（不呼叫真實 CLI）。
 * 輸出取自 providers 套件的 P1-T011 去識別化實錄。
 */

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../packages/providers/src/claude/fixtures',
);
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

interface Script {
  version?: string;
  auth?: string;
  run?: string;
  /** 正式執行輸出完就卡住（不結束），直到被 kill */
  hangRun?: boolean;
}

function fakeClaude(script: Script = {}) {
  const calls: { file: string; args: readonly string[]; env: Record<string, string> }[] = [];
  const spawn: SpawnFn = (file, args, options) => {
    calls.push({ file, args, env: { ...(options.env as Record<string, string>) } });
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    let killed = false;
    Object.assign(child, {
      stdout,
      stderr: new PassThrough(),
      stdin: new PassThrough(),
      kill: () => (killed = true),
    });
    const out =
      args[0] === '--version'
        ? (script.version ?? '2.1.296 (Claude Code)\n')
        : args[0] === 'auth'
          ? (script.auth ?? fixture('auth-subscription.json'))
          : (script.run ?? fixture('run-ok.jsonl'));
    const lines = out.split(/(?<=\n)/);
    const step = (i: number) => {
      const line = lines[i];
      if (!killed && line === undefined && script.hangRun && args[0] === '-p') return;
      if (killed || line === undefined) {
        stdout.end();
        setImmediate(() => child.emit('close', killed ? null : 0));
        return;
      }
      stdout.write(line);
      setImmediate(() => step(i + 1));
    };
    setImmediate(() => step(0));
    return child;
  };
  return { spawn, calls };
}

const ENV = { HOME: '/Users/owner', USER: 'owner', ANTHROPIC_API_KEY: 'k-not-real' };

function probeWith(script: Script = {}, located: string | null = '/fake/claude') {
  const fake = fakeClaude(script);
  const service = createClaudeService({
    locate: () => Promise.resolve(located),
    findManagedSettings: () => Promise.resolve([]),
  });
  const probe = createClaudeProbe({
    service,
    runDeps: {
      spawn: fake.spawn,
      parentEnv: ENV,
      now: () => new Date('2026-10-10T00:00:00.000Z'),
      newId: () => 'run-1',
    },
  });
  return { probe, fake };
}

describe('Claude 檢查（假 spawn）', () => {
  it('已驗證版本＋訂閱登入：各項 passed，子程序環境沒有 API key', async () => {
    const { probe, fake } = probeWith();
    expect(await probe.check()).toMatchObject({
      installed: 'passed',
      login: 'passed',
      eligibility: 'passed',
      subscriptionOnly: 'passed',
      isolation: 'passed',
    });
    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      expect(call.file).toBe('/fake/claude');
      expect(call.env).not.toHaveProperty('ANTHROPIC_API_KEY');
      // 重新檢查不呼叫模型
      expect(call.args[0] === '--version' || call.args[0] === 'auth').toBe(true);
    }
  });

  it('找不到 CLI：installed failed，不啟動任何程式', async () => {
    const { probe, fake } = probeWith({}, null);
    expect((await probe.check()).installed).toBe('failed');
    expect(fake.calls).toHaveLength(0);
  });

  it('未驗證版本（沒有保存介面）：isolation failed，不做重新驗證、0 次模型呼叫', async () => {
    const { probe, fake } = probeWith({ version: '2.1.300 (Claude Code)\n' });
    const check = await probe.check();
    expect(check.isolation).toBe('failed');
    expect(check.subscriptionOnly).not.toBe('passed');
    expect(fake.calls.some((c) => c.args.includes('-p') || c.args.includes('--print'))).toBe(false);
    expect(await probe.verifyModel('haiku')).toMatchObject({
      verification: 'unknown',
      blocked: true,
    });
    expect(fake.calls.filter((c) => c.args[0] !== '--version' && c.args[0] !== 'auth')).toEqual([]);
  });

  it('apiKeyHelper 設定：R6 failed → 狀態尚未支援', async () => {
    const svc = createProvidersService({
      claudeProbe: probeWith({ auth: fixture('auth-api-key-helper.json') }).probe,
    });
    const status = await svc.recheck('claude');
    expect(status.subscriptionOnly).toBe('failed');
    expect(status.state).not.toBe('available');
  });

  it('未登入 → not_logged_in', async () => {
    const svc = createProvidersService({
      claudeProbe: probeWith({ auth: fixture('auth-logged-out.json') }).probe,
    });
    expect((await svc.recheck('claude')).state).toBe('not_logged_in');
  });

  it('模型短驗證：成功 passed＋留下 R6 紀錄；額度 429 → failed 並標額度不足', async () => {
    const ok = await probeWith().probe.verifyModel('haiku');
    expect(ok.verification).toBe('passed');
    expect(ok.record?.executed).toBe(true);
    expect(ok.record?.subscriptionOnly).toBe('passed');

    const quota = await probeWith({ run: fixture('run-quota-429.jsonl') }).probe.verifyModel(
      'haiku',
    );
    expect(quota).toMatchObject({ verification: 'failed', quotaExhausted: true });
  });

  it('init 帶工具（隔離失敗）→ failed，不算可用', async () => {
    const res = await probeWith({ run: fixture('run-init-tools.jsonl') }).probe.verifyModel(
      'haiku',
    );
    expect(res.verification).toBe('failed');
    expect(res.quotaExhausted).toBe(false);
  });

  it('模型參數只來自候選常數：選定時命令列的 --model 是別名，不是請求的 candidateId', async () => {
    const { probe, fake } = probeWith();
    let i = 0;
    const svc = createProvidersService({ claudeProbe: probe, newCandidateId: () => `cand${i++}` });
    const [first] = await svc.listCandidates('claude');
    expect(first?.candidateId).toBe('cand0');
    expect((await svc.recheck('claude')).state).toBe('available');
    expect(await svc.selectCandidate('claude', 'cand0')).toEqual({
      kind: 'verified',
      verification: 'passed',
    });
    const run = fake.calls.find((c) => c.args.includes('--model'));
    const model = run?.args[run.args.indexOf('--model') + 1];
    expect(model).toBe('haiku');
    expect(run?.args).not.toContain('cand0');
  });

  it('模型短驗證卡住 → 逾時中止行程、回無法確認（P1-T044 對抗驗證）', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { probe, fake } = probeWith({ run: '', hangRun: true });
      const pending = probe.verifyModel('haiku');
      const running = () => fake.calls.some((c) => c.args[0] === '-p');
      for (let i = 0; i < 1000 && !running(); i += 1) {
        await new Promise((r) => setImmediate(r));
      }
      expect(running()).toBe(true);
      await vi.advanceTimersByTimeAsync(CLAUDE_MODEL_VERIFY_TIMEOUT_MS + 1);
      // 修正前：沒有逾時，這裡永遠等不到（測試逾時）
      expect(await pending).toMatchObject({ verification: 'unknown', blocked: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
