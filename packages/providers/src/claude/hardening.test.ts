import { spawn as nodeSpawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SpawnFn } from '../core/process.ts';
import { type RunDeps, type RunRequest, runWithSubscriptionCheck } from '../core/run-check.ts';
import { createClaudeAdapter } from './adapter.ts';
import { fakeClaude, fixture } from './fake-spawn.ts';
import { claudeRunDeps, createClaudeStreamGuard, isClaudeStreamGuarded } from './guard.ts';
import { verifyClaudeModel } from './models.ts';

/** 對抗驗證（E3）找到的缺陷回歸測試：守門強制、執行檔鎖定、並行模型驗證、程序群組終止。 */

const REQ: RunRequest = { model: 'haiku', prompt: '摘要這份職缺', trigger: 'run_start' };
const baseDeps = (spawn: SpawnFn): RunDeps => ({
  parentEnv: { HOME: '/Users/owner', USER: 'owner' },
  now: () => new Date('2026-10-10T00:00:00Z'),
  newId: () => 'run-1',
  spawn,
});
const adapterAt = (...paths: (string | null)[]) => {
  let i = 0;
  return createClaudeAdapter({
    locate: () => Promise.resolve(paths[Math.min(i++, paths.length - 1)] ?? null),
    findManagedSettings: () => Promise.resolve([]),
  });
};
const authLines = () => fixture('auth-subscription.json').split(/(?<=\n)/).length;

describe('串流守門強制套用', () => {
  it('verifyClaudeModel：呼叫端給未包裝的 spawn，init apiKeySource=ANTHROPIC_API_KEY 仍在第一行終止', async () => {
    const fake = fakeClaude({ run: { stdout: fixture('run-init-api-key.jsonl') } });
    const res = await verifyClaudeModel(adapterAt('/fake/claude'), 'haiku', baseDeps(fake.spawn));
    expect(res.record.executed).toBe(true);
    expect(res.available).toBe(false);
    expect(fake.killed).toBe(true);
    expect(fake.emittedLines).toBe(1 + authLines() + 1);
  });

  it('claudeRunDeps：包上守門、已包過不重複包、沒給 spawn 時包 node spawn', () => {
    const fake = fakeClaude({});
    const deps = claudeRunDeps(baseDeps(fake.spawn));
    expect(isClaudeStreamGuarded(deps.spawn)).toBe(true);
    expect(claudeRunDeps(deps).spawn).toBe(deps.spawn);
    const noSpawn: RunDeps = { parentEnv: {}, now: () => new Date(), newId: () => 'x' };
    expect(isClaudeStreamGuarded(claudeRunDeps(noSpawn).spawn)).toBe(true);
    expect(isClaudeStreamGuarded(fake.spawn)).toBe(false);
  });
});

describe('執行檔鎖定：只執行確認時的路徑', () => {
  it('確認後 CLI 路徑改變（自動更新）→ 不執行', async () => {
    const fake = fakeClaude({});
    const adapter = adapterAt('/v/2.1.296/claude', '/v/2.1.300/claude');
    const out = await runWithSubscriptionCheck(adapter, REQ, claudeRunDeps(baseDeps(fake.spawn)));
    expect(out.status).toBe('executed');
    if (out.status !== 'executed' || out.result.ok) throw new Error('應該失敗');
    expect(out.result.error.message).toContain('改變');
    expect(fake.calls.filter((c) => c.args[0] === '-p')).toEqual([]);
  });

  it('沒有經過執行前確認就呼叫 execute → 不執行；同一次確認不能執行兩次', async () => {
    const adapter = adapterAt('/fake/claude');
    let launched = 0;
    const launch = () => {
      launched += 1;
      return Promise.resolve({
        exitCode: 0,
        stdout: fixture('run-ok.jsonl'),
        stderr: '',
        aborted: false,
        truncated: false,
      });
    };
    const first = await adapter.execute({ launch, model: 'haiku', prompt: 'x' });
    expect(first.ok).toBe(false);
    await adapter.verifySubscriptionRoute({ launch });
    const before = launched;
    expect((await adapter.execute({ launch, model: 'haiku', prompt: 'x' })).ok).toBe(true);
    expect(launched).toBe(before + 1);
    expect((await adapter.execute({ launch, model: 'haiku', prompt: 'x' })).ok).toBe(false);
    expect(launched).toBe(before + 1);
  });
});

describe('並行模型驗證', () => {
  it('Promise.all 同時驗證多個別名，各自的 resolvedModel／contextWindow 正確', async () => {
    const models = ['haiku', 'sonnet', 'opus', 'fable'];
    const windows = [200000, 400000, 600000, 800000];
    const shared = fakeClaude({});
    // 越前面的模型輸出越多空行，讓結束順序與開始順序相反
    const perModel = models.map((m, i) =>
      fakeClaude({
        run: {
          stdout:
            '\n'.repeat((models.length - i) * 3) +
            fixture('run-ok.jsonl')
              .replaceAll('claude-haiku-5-5', `claude-${m}-test`)
              .replace('"contextWindow":1000000', `"contextWindow":${windows[i]}`),
        },
      }),
    );
    const spawn: SpawnFn = (file, args, options) => {
      const index = models.findIndex((m) => args.includes(m));
      return args[0] === '-p' && index >= 0
        ? (perModel[index]?.spawn ?? shared.spawn)(file, args, options)
        : shared.spawn(file, args, options);
    };
    const adapter = adapterAt('/fake/claude');
    const results = await Promise.all(
      models.map((m) => verifyClaudeModel(adapter, m, baseDeps(spawn))),
    );
    results.forEach((r, i) => {
      expect(r).toMatchObject({
        model: models[i],
        available: true,
        resolvedModel: `claude-${models[i]}-test`,
        contextWindow: windows[i],
      });
    });
  });
});

describe('守門終止整個程序群組', () => {
  it.skipIf(process.platform === 'win32')(
    '假 CLI 開出的孫程序在守門終止時一起被終止',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'rolecraft-guard-'));
      try {
        const lines = fixture('run-tool-use.jsonl').split('\n').slice(0, 2).join('\n') + '\n';
        await writeFile(join(dir, 'lines.jsonl'), lines);
        const script = join(dir, 'fakecli.sh');
        await writeFile(
          script,
          '#!/bin/sh\nsleep 30 &\necho $! > "$1/grandchild.pid"\ncat "$1/lines.jsonl"\nsleep 30\n',
        );
        let violations = 0;
        const spawn = createClaudeStreamGuard(nodeSpawn, { onViolation: () => (violations += 1) });
        const child = spawn('/bin/sh', [script, dir, '--output-format', 'stream-json'], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        await new Promise<void>((resolve) => child.on('close', () => resolve()));
        expect(violations).toBe(1);
        const pid = Number((await readFile(join(dir, 'grandchild.pid'), 'utf8')).trim());
        expect(pid).toBeGreaterThan(0);
        const alive = () => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        for (let i = 0; i < 40 && alive(); i += 1) {
          await new Promise((r) => setTimeout(r, 25));
        }
        expect(alive()).toBe(false);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
