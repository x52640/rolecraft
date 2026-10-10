import type { RunCheckRecord, WorkJob } from '@rolecraft/contracts';
import { checkExportReadiness, createWorkRun } from '@rolecraft/domain';
import {
  createFakeAdapter,
  runWithSubscriptionCheck,
  type FakeAdapterOptions,
  type FakeStep,
} from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import {
  CLAIMS,
  INJECTION,
  UNUSABLE,
  budget,
  idSource,
  output,
  profile,
  section,
  snapshot,
} from './fixtures.test-helpers.ts';
import { planGeneration } from './prepare.ts';
import { createGenerationRunner, type GenerationRunnerDeps } from './runner.ts';
import type { GenerationInputs, GenerationPlan, GenerationResult } from './types.ts';

const GOOD = output([
  section(),
  section({
    placement: 'summary',
    text: '匯出 PDF 已完成',
    citations: [{ claim: 'C2', statedCompletion: 'completed' }],
  }),
]);
/** 唯一一段把「文件標示完成」寫成已完成 → 沒有段落留下 */
const OVERCLAIM = output([
  section({ citations: [{ claim: 'C1', statedCompletion: 'completed' }] }),
]);
/** 引用不在提供清單內（例如被注入後捏造的）事實項 */
const FABRICATED = output([
  section({ citations: [{ claim: 'C42', statedCompletion: 'planned' }] }),
]);

interface Harness {
  readonly deps: GenerationRunnerDeps<string>;
  readonly commits: { job: WorkJob; result: GenerationResult }[];
  readonly saved: WorkJob[];
  readonly records: RunCheckRecord[];
  readonly sleeps: number[];
  readonly prompts: string[];
}

function harness(
  script: readonly FakeStep[],
  options: { fake?: FakeAdapterOptions; inputs?: GenerationInputs } = {},
): Harness {
  const fake = createFakeAdapter({ script, ...options.fake });
  let aborted = false;
  const h: Harness = {
    commits: [],
    saved: [],
    records: [],
    sleeps: [],
    prompts: fake.calls.prompts,
    deps: {
      provider: 'claude',
      model: 'fake-model',
      execute: ({ prompt }) =>
        runWithSubscriptionCheck(
          fake,
          { model: 'fake-model', prompt, trigger: 'run_start' },
          { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'run-check' },
        ),
      cancellation: { signal: 'signal', abort: () => (aborted = true), aborted: () => aborted },
      loadInputs: () =>
        Promise.resolve(
          options.inputs ?? {
            profile: profile(),
            jobSnapshot: snapshot(),
            claims: [...CLAIMS, ...UNUSABLE],
          },
        ),
      commitUnit: ({ job, written }) => {
        h.commits.push({ job, result: written.output });
        return Promise.resolve();
      },
      saveJob: (job) => {
        h.saved.push(job);
        return Promise.resolve();
      },
      recordRunCheck: (record) => {
        h.records.push(record);
        return Promise.resolve();
      },
      newId: idSource('b'),
      now: () => Date.parse('2026-10-10T10:00:00.000Z'),
      sleep: (ms) => {
        h.sleeps.push(ms);
        return Promise.resolve();
      },
    },
  };
  return h;
}

function makePlan(): GenerationPlan {
  const result = planGeneration({
    jobSnapshot: snapshot(),
    budget: budget(200_000),
    newId: idSource('p'),
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

function start(h: Harness) {
  const plan = makePlan();
  return createGenerationRunner(plan, createWorkRun(plan.jobId, [plan.unitId]), h.deps);
}

describe('generation runner（fake provider）', () => {
  it('generates once, writes a cited version, and keeps job content as data', async () => {
    const h = harness([{ text: GOOD }]);
    const report = await start(h).run();
    expect(report.status).toBe('completed');
    expect(h.commits).toHaveLength(1);
    const result = h.commits[0]?.result;
    expect(result?.resumeVersion.sections).toHaveLength(2);
    expect(result?.resumeVersion.createdAt).toBe('2026-10-10T10:00:00.000Z');
    expect(
      checkExportReadiness({
        sections: result?.resumeVersion.sections ?? [],
        claims: CLAIMS,
        profile: null,
      }).ok,
    ).toBe(true);
    expect(h.records.every((r) => r.executed && r.subscriptionOnly === 'passed')).toBe(true);
    const prompt = h.prompts[0] ?? '';
    const block =
      /<<<DATA JOB_DESCRIPTION (\w+)>>>\n([\s\S]*?)\n<<<END JOB_DESCRIPTION \1>>>/u.exec(prompt);
    expect(block?.[2]).toContain(INJECTION);
    expect(prompt.replace(block?.[0] ?? '', '')).not.toContain(INJECTION);
    // 不可用的事實項不送出
    expect(prompt).not.toContain('金流串接');
  });

  it.each([
    ['schema failure', '不是 JSON'],
    ['overclaimed completion in every section', OVERCLAIM],
    ['citations to claims that were not provided', FABRICATED],
  ])('never writes on %s; retries with a cap then pauses', async (_, text) => {
    const h = harness([{ text }, { text }, { text }]);
    const report = await start(h).run();
    expect(report.status).toBe('paused');
    expect(report.job.pauseReason).toBe('retries_exhausted');
    expect(h.commits).toHaveLength(0);
    expect(h.prompts).toHaveLength(3);
    expect(h.sleeps).toEqual([2_000, 4_000]);
  });

  it('recovers when a retry returns a valid output', async () => {
    const h = harness([{ text: OVERCLAIM }, { text: GOOD }]);
    expect((await start(h).run()).status).toBe('completed');
    expect(h.commits).toHaveLength(1);
  });

  it("does not retry provider 'other' errors (401, isolation failure)", async () => {
    const h = harness([{ error: 'other', message: '401' }, { text: GOOD }]);
    const report = await start(h).run();
    expect(report.status).toBe('blocked');
    if (report.status !== 'blocked') return;
    expect(report.failure).toMatchObject({ kind: 'provider', error: { kind: 'other' } });
    expect(report.job.status).toBe('running');
    expect(h.prompts).toHaveLength(1);
    expect(h.sleeps).toEqual([]);
    expect(h.commits).toHaveLength(0);
  });

  it('pauses on quota without retrying', async () => {
    const h = harness([{ error: 'quota_exhausted' }]);
    const report = await start(h).run();
    expect(report.job.pauseReason).toBe('quota_exhausted');
    expect(h.prompts).toHaveLength(1);
    expect(h.commits).toHaveLength(0);
  });

  it('does not send when R6 fails', async () => {
    const h = harness([{ text: GOOD }], {
      fake: { route: { executionMode: { outcome: 'failed', basis: 'API key 模式' } } },
    });
    const report = await start(h).run();
    expect(report.status).toBe('blocked');
    expect(h.prompts).toHaveLength(0);
    expect(h.records).toHaveLength(1);
    expect(h.commits).toHaveLength(0);
  });

  it('does not send when the snapshot lost its confirmation after planning', async () => {
    const h = harness([{ text: GOOD }], {
      inputs: { profile: profile(), jobSnapshot: snapshot({ confirmedAt: null }), claims: CLAIMS },
    });
    const report = await start(h).run();
    expect(report).toMatchObject({ status: 'not_sent', reason: 'snapshot_not_confirmed' });
    expect(h.prompts).toHaveLength(0);
    expect(h.records).toHaveLength(0);
  });

  it('a paused job does not run by itself (D21)', async () => {
    const h = harness([{ error: 'quota_exhausted' }]);
    const runner = start(h);
    await runner.run();
    expect((await runner.run()).status).toBe('not_running');
    expect(h.prompts).toHaveLength(1);
  });
});
