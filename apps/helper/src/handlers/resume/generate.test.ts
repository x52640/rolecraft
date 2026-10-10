// resume.generate：經 Claude 執行（ClaudeService.run＋helperClaudeDeps）與 P1-T024 runner，
// 子程序一律是假 spawn（輸出改寫自 providers 套件的去識別化實錄），不呼叫真實 CLI。
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import type { InputBudget } from '@rolecraft/domain';
import { createClaudeService, type RunDeps } from '@rolecraft/providers';
import { afterEach, describe, expect, it } from 'vitest';

import { INVALID, JOB, openResumeDb, snapshot, type ResumeDb } from './__fixtures__/resume-db.ts';
import type { ProvidersService } from '../providers/service.ts';
import { pauseInterruptedJobs } from './assemble.ts';
import { createClaudeGenerationEngine } from './claude-engine.ts';
import type { GenerationEngine } from './generation.ts';

type SpawnFn = NonNullable<RunDeps['spawn']>;

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../../../../../packages/providers/src/claude/fixtures',
);
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

/** 把實錄的回覆文字換成指定內容（assistant 訊息與最後的 result 都換）。 */
function runWithResult(text: string): string {
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

/** C1 c-done、C2 c-doc、C3 c-metric（c-review 待複核，不會送出）。 */
const GOOD = JSON.stringify({
  matches: [{ requirement: '前端開發', claims: ['C2'] }],
  gaps: [{ requirement: 'React', question: '是否有 React 經驗？' }],
  sections: [
    {
      placement: 'E1',
      text: '開發登入功能',
      citations: [{ claim: 'C2', statedCompletion: 'in_progress' }],
      rationale: '對應前端開發需求',
    },
    {
      placement: 'summary',
      text: '完成匯出 PDF',
      citations: [{ claim: 'C1', statedCompletion: 'completed' }],
      rationale: '突顯交付經驗',
    },
  ],
});

function fakeClaude(run: string, auth = fixture('auth-subscription.json')) {
  const calls: { args: readonly string[]; env: Record<string, string>; stdin: string }[] = [];
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

const BUDGET: InputBudget = {
  contextLimit: 100_000,
  outputReserve: 0,
  toolOverheadReserve: 0,
  available: 100_000,
};

let t: ResumeDb | null = null;
afterEach(() => t?.cleanup());

/** 假 providers 服務：Claude 可用且選定唯一候選（對應 candidates ['haiku']）；model 為 null 表示沒選定。 */
function providers(model: string | null): ProvidersService {
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

function setup(run: string, model: string | null = 'haiku', auth?: string) {
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
  t = openResumeDb({ withVersion: false, generation: engine, onGenerationSettled: settle });
  return { fake, settled, db: t };
}

const generate = (db: ResumeDb, jobSnapshotId = JOB) =>
  db.send({ op: 'resume.generate', payload: { jobSnapshotId } });

describe('resume.generate（假 spawn）', () => {
  it('已確認快照：回工作 id，背景完成後存成待接受的版本，段落歸屬對應 contracts placement', async () => {
    const { fake, settled, db } = setup(runWithResult(GOOD));
    const res = (await generate(db)) as { ok: true; workJobId: string };
    expect(res.ok).toBe(true);
    await settled;

    expect(db.repos.workJobs.get(res.workJobId)?.status).toBe('completed');
    const [version] = db.repos.resumeVersions.listByJobSnapshot(JOB);
    expect(version?.sections).toMatchObject([
      {
        origin: 'generated',
        text: '開發登入功能',
        placement: {
          group: 'experience',
          company: '甲公司',
          title: '前端工程師',
          startDate: '2021-03',
        },
        decision: 'pending',
        rationale: '對應前端開發需求',
        citations: [{ claimId: 'c-doc', statedCompletion: 'in_progress' }],
        generatedCitations: [{ claimId: 'c-doc', statedCompletion: 'in_progress' }],
      },
      { placement: { group: 'summary' }, decision: 'pending', rationale: '突顯交付經驗' },
    ]);
    // R6 確認紀錄有保存；子程序環境沒有 API key；待複核事實項沒送出
    expect(db.repos.runCheckRecords.listByProvider('claude')).toHaveLength(1);
    const [call] = fake.modelCalls();
    expect(call?.args).toContain('haiku');
    expect(call?.env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(call?.stdin).toContain('登入功能');
    expect(call?.stdin).not.toContain('金流串接');
    // 生成的段落仍要逐段接受，匯出前檢查擋下
    const check = await db.send({
      op: 'resume.check_export',
      payload: { resumeVersionId: version?.id },
    });
    expect(check).toMatchObject({ ok: true, ready: false });
  });

  it('快照未確認：不建工作、不啟動任何程式', async () => {
    const { fake, db } = setup(runWithResult(GOOD));
    db.repos.jobSnapshots.save(snapshot({ confirmedAt: null }));
    expect(await generate(db)).toMatchObject(INVALID);
    expect(fake.calls).toHaveLength(0);
    expect(db.repos.workJobs.list()).toEqual([]);
  });

  it('沒有選定模型、找不到快照、沒有可用事實項：不送出', async () => {
    const none = setup(runWithResult(GOOD), null);
    expect(await generate(none.db)).toMatchObject(INVALID);
    expect(await generate(none.db, 'ghost-1')).toMatchObject(INVALID);
    expect(none.fake.calls).toHaveLength(0);
    none.db.cleanup();

    const { fake, db } = setup(runWithResult(GOOD));
    for (const claim of db.repos.claims.list()) {
      db.repos.claims.save({ ...claim, reviewStatus: 'needs_review' });
    }
    expect(await generate(db)).toMatchObject(INVALID);
    expect(fake.calls).toHaveLength(0);
  });

  it('模型輸出不合格：有上限重試後暫停，不寫入任何版本', async () => {
    const { fake, settled, db } = setup(runWithResult('不是 JSON'));
    const res = (await generate(db)) as { ok: true; workJobId: string };
    await settled;
    expect(fake.modelCalls()).toHaveLength(3);
    expect(db.repos.workJobs.get(res.workJobId)).toMatchObject({
      status: 'paused',
      pauseReason: 'retries_exhausted',
    });
    expect(db.repos.resumeVersions.listByJobSnapshot(JOB)).toEqual([]);
  });

  it('R6 不成立（未登入訂閱）：不送出，工作改為已暫停而不是停在 running', async () => {
    const { fake, settled, db } = setup(
      runWithResult(GOOD),
      'haiku',
      fixture('auth-logged-out.json'),
    );
    const res = (await generate(db)) as { ok: true; workJobId: string };
    await settled;
    expect(fake.modelCalls()).toHaveLength(0);
    expect(db.repos.workJobs.get(res.workJobId)).toMatchObject({
      status: 'paused',
      pauseReason: 'interrupted',
    });
    expect(db.repos.resumeVersions.listByJobSnapshot(JOB)).toEqual([]);
  });

  it('同一職缺已有生成在跑：第二次回 invalid_request；執行丟出例外後工作改為已暫停', async () => {
    let release: () => void = () => undefined;
    const engine: GenerationEngine = {
      select: () =>
        Promise.resolve({
          provider: 'claude',
          model: 'haiku',
          budget: BUDGET,
          execute: () =>
            new Promise((_resolve, reject) => {
              release = () => reject(new Error('stop'));
            }),
        }),
    };
    let settle: () => void = () => undefined;
    const settled = new Promise<void>((resolve) => (settle = resolve));
    t = openResumeDb({ withVersion: false, generation: engine, onGenerationSettled: settle });
    const res = (await generate(t)) as { ok: true; workJobId: string };
    expect(res.ok).toBe(true);
    expect(await generate(t)).toMatchObject(INVALID);
    release();
    await settled;
    expect(t.repos.workJobs.get(res.workJobId)).toMatchObject({
      status: 'paused',
      pauseReason: 'interrupted',
    });
  });
});

describe('pauseInterruptedJobs（helper 啟動時）', () => {
  it('上次留下的 running 工作改為已暫停（interrupted），其他狀態不動', () => {
    t = openResumeDb({ withVersion: false });
    const unit = {
      id: 'u-1',
      status: 'pending',
      provider: null,
      model: null,
      retryCount: 0,
    } as const;
    t.repos.workJobs.save({ id: 'w-run', status: 'running', units: [unit], pauseReason: null });
    t.repos.workJobs.save({
      id: 'w-paused',
      status: 'paused',
      units: [{ ...unit, id: 'u-2' }],
      pauseReason: 'quota_exhausted',
    });
    pauseInterruptedJobs(t.db);
    expect(t.repos.workJobs.get('w-run')).toMatchObject({
      status: 'paused',
      pauseReason: 'interrupted',
    });
    expect(t.repos.workJobs.get('w-paused')).toMatchObject({ pauseReason: 'quota_exhausted' });
  });
});
