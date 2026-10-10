// Claude 草稿執行端：用假 spawn 跑 @rolecraft/providers 的真實執行路徑（不呼叫真實 CLI）。
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { createClaudeService, type RunDeps } from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import type { ProvidersService, ServiceStatus } from '../providers/service.ts';
import { createClaudeDraftEngine } from './claude-engine.ts';

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../packages/providers/src/claude/fixtures',
);
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

/** 把實錄的 result 事件換成指定文字。 */
function runWithResult(text: string): string {
  return fixture('run-ok.jsonl')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'result') event.result = text;
      return JSON.stringify(event);
    })
    .join('\n')
    .concat('\n');
}

function fakeClaude(run: string) {
  const calls: { args: readonly string[]; env: Record<string, string> }[] = [];
  const spawn: SpawnFn = (_file, args, options) => {
    calls.push({ args, env: { ...(options.env as Record<string, string>) } });
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
        ? '2.1.296 (Claude Code)\n'
        : args[0] === 'auth'
          ? fixture('auth-subscription.json')
          : run;
    const lines = out.split(/(?<=\n)/);
    const step = (i: number) => {
      const line = lines[i];
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

const CANDIDATES = ['haiku', 'sonnet', 'opus', 'fable'];

function providers(status: Partial<ServiceStatus>): ProvidersService {
  return {
    status: () =>
      Promise.resolve([
        {
          service: 'claude',
          state: 'available',
          login: 'passed',
          eligibility: 'passed',
          subscriptionOnly: 'passed',
          checkedAt: '2026-10-10T00:00:00.000Z',
          selectedCandidateId: 'c2',
          ...status,
        },
      ]),
    listCandidates: () =>
      Promise.resolve(CANDIDATES.map((_, i) => ({ candidateId: `c${String(i + 1)}`, label: 'x' }))),
  };
}

function engineWith(
  status: Partial<ServiceStatus>,
  run = runWithResult('{"draft":"您好","citations":[]}'),
) {
  const fake = fakeClaude(run);
  const resolve = createClaudeDraftEngine({
    providers: providers(status),
    service: createClaudeService({
      locate: () => Promise.resolve('/fake/claude'),
      findManagedSettings: () => Promise.resolve([]),
    }),
    runDeps: {
      spawn: fake.spawn,
      parentEnv: { HOME: '/Users/owner', ANTHROPIC_API_KEY: 'k-not-real' },
      now: () => new Date('2026-10-10T00:00:00.000Z'),
      newId: () => 'run-1',
    },
    candidates: CANDIDATES,
  });
  return { resolve, fake };
}

describe('createClaudeDraftEngine（假 spawn）', () => {
  it('用使用者選定的模型執行；R6 通過、子程序環境沒有 API key', async () => {
    const { resolve, fake } = engineWith({});
    const engine = await resolve();
    expect(engine?.model).toBe('sonnet');
    const outcome = await engine?.execute({ prompt: '提示', signal: new AbortController().signal });
    expect(outcome?.status).toBe('executed');
    expect(outcome?.record).toMatchObject({ model: 'sonnet', subscriptionOnly: 'passed' });
    expect(outcome?.status === 'executed' && outcome.result).toEqual({
      ok: true,
      text: '{"draft":"您好","citations":[]}',
    });
    for (const call of fake.calls) expect(call.env).not.toHaveProperty('ANTHROPIC_API_KEY');
  });

  it('401 回 other 錯誤（由 runner 決定不重試）', async () => {
    const { resolve } = engineWith({}, fixture('run-is-error-401.jsonl'));
    const outcome = await (
      await resolve()
    )?.execute({
      prompt: '提示',
      signal: new AbortController().signal,
    });
    expect(outcome?.status === 'executed' && !outcome.result.ok && outcome.result.error.kind).toBe(
      'other',
    );
  });

  it.each([
    ['服務不是可用', { state: 'quota_exhausted' as const }],
    ['沒有選定模型', { selectedCandidateId: null }],
    ['選定的候選不在清單', { selectedCandidateId: 'c9' }],
  ])('%s：不提供執行端、不啟動任何程式', async (_name, status) => {
    const { resolve, fake } = engineWith(status);
    expect(await resolve()).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });
});
