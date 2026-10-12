// resume.generate 測試共用：假 Claude 子程序（輸出改寫自 providers 套件的去識別化實錄），不呼叫真實 CLI。
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import type { InputBudget } from '@rolecraft/domain';
import { createClaudeService, type RunDeps } from '@rolecraft/providers';

import type { ProvidersService } from '../../providers/service.ts';
import { createClaudeGenerationEngine } from '../claude-engine.ts';
import { openResumeDb, type ResumeDb } from './resume-db.ts';

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../../packages/providers/src/claude/fixtures',
);
export const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

/** 把實錄的回覆文字換成指定內容（assistant 訊息與最後的 result 都換）。 */
export function runWithResult(text: string): string {
  return fixture('run-ok.jsonl')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'result') event.result = text;
      if (event.type === 'assistant') {
        const message = event.message as { content: { type: string; text?: string }[] };
        message.content = [{ type: 'text', text }];
      }
      return JSON.stringify(event);
    })
    .join('\n')
    .concat('\n');
}

interface FakeCall {
  args: readonly string[];
  env: Record<string, string>;
  stdin: string;
}

export interface FakeClaude {
  readonly spawn: SpawnFn;
  readonly calls: FakeCall[];
  modelCalls(): FakeCall[];
}

export function fakeClaude(run: string, auth = fixture('auth-subscription.json')): FakeClaude {
  const calls: FakeCall[] = [];
  const spawn: SpawnFn = (_file, args, options) => {
    const call = { args, env: { ...(options.env as Record<string, string>) }, stdin: '' };
    calls.push(call);
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    stdin.on('data', (chunk: Buffer) => (call.stdin += chunk.toString('utf8')));
    let killed = false;
    Object.assign(child, { stdout, stderr: new PassThrough(), stdin, kill: () => (killed = true) });
    const out =
      args[0] === '--version' ? '2.1.296 (Claude Code)\n' : args[0] === 'auth' ? auth : run;
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
  return { spawn, calls, modelCalls: () => calls.filter((c) => c.stdin !== '') };
}

export const BUDGET: InputBudget = {
  contextLimit: 100_000,
  outputReserve: 0,
  toolOverheadReserve: 0,
  available: 100_000,
};

/** 假 providers 服務：Claude 可用且選定唯一候選（對應 candidates ['haiku']）；model 為 null 表示沒選定。 */
export function providers(model: string | null): ProvidersService {
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
          selectedCandidateId: model === null ? null : 'cand-1',
        },
      ]),
    listCandidates: () => Promise.resolve([{ candidateId: 'cand-1', label: 'Claude Haiku' }]),
  };
}

/** 以假 Claude 開一個履歷資料庫；settled 在背景生成結束時 resolve。呼叫端負責 cleanup。 */
export function setupGeneration(
  run: string,
  model: string | null = 'haiku',
  auth?: string,
): { fake: FakeClaude; settled: Promise<void>; db: ResumeDb } {
  const fake = fakeClaude(run, auth);
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => (settle = resolve));
  const engine = createClaudeGenerationEngine({
    service: createClaudeService({
      locate: () => Promise.resolve('/fake/claude'),
      findManagedSettings: () => Promise.resolve([]),
    }),
    providers: providers(model),
    candidates: ['haiku'],
    budget: BUDGET,
    runDeps: {
      spawn: fake.spawn,
      parentEnv: { HOME: '/Users/owner', ANTHROPIC_API_KEY: 'k-not-real' },
      now: () => new Date('2026-10-10T00:00:00.000Z'),
    },
    sleep: () => Promise.resolve(),
  });
  const db = openResumeDb({ withVersion: false, generation: engine, onGenerationSettled: settle });
  return { fake, settled, db };
}
