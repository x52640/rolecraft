import type { RunCheckRecord, WorkJob } from '@rolecraft/contracts';
import { createWorkRun } from '@rolecraft/domain';
import {
  createFakeAdapter,
  runWithSubscriptionCheck,
  type FakeAdapterOptions,
  type FakeStep,
} from '@rolecraft/providers';
import { describe, expect, it } from 'vitest';

import { CLAIMS, UNUSABLE, idSource, snapshot } from '../generation/fixtures.test-helpers.ts';
import { draftJson, makePlan, message } from './fixtures.test-helpers.ts';
import { createDraftRunner, type DraftRunnerDeps } from './runner.ts';
import type { DraftInputs, DraftResult } from './types.ts';

const GOOD = draftJson('感謝您的邀約，我曾負責登入功能，很樂意進一步了解，請告知後續安排方式。', [
  'C1',
]);
/** 照對方訊息裡的注入「承諾」到職日與薪資 */
const INJECTED = draftJson('好的，我下週一可以到職，期望月薪 10 萬。');

interface Harness {
  readonly deps: DraftRunnerDeps<string>;
  readonly commits: { job: WorkJob; result: DraftResult }[];
  readonly saved: WorkJob[];
  readonly records: RunCheckRecord[];
  readonly sleeps: number[];
  readonly prompts: string[];
}

function harness(
  script: readonly FakeStep[],
  options: { fake?: FakeAdapterOptions; inputs?: DraftInputs } = {},
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
            message: message(),
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

function start(h: Harness) {
  const plan = makePlan();
  return createDraftRunner(plan, createWorkRun(plan.jobId, [plan.unitId]), h.deps);
}

describe('draft runner（fake provider）', () => {
  it('generates once and commits a checked draft', async () => {
    const h = harness([{ text: GOOD }]);
    const report = await start(h).run();
    expect(report.status).toBe('completed');
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0]?.result).toMatchObject({
      messageDraftId: 'msg-1',
      replyIntent: 'accept',
      citedClaimIds: ['claim-doc-done'],
    });
    expect(h.records.every((r) => r.executed && r.subscriptionOnly === 'passed')).toBe(true);
  });

  it('never writes an injected commitment; retries with a cap then pauses', async () => {
    const h = harness([{ text: INJECTED }, { text: INJECTED }, { text: INJECTED }]);
    const report = await start(h).run();
    expect(report.status).toBe('paused');
    expect(report.job.pauseReason).toBe('retries_exhausted');
    expect(h.commits).toHaveLength(0);
    expect(h.sleeps).toEqual([2000, 4000]);
    expect(h.prompts).toHaveLength(3);
  });

  it('a bad first output can be fixed by a retry', async () => {
    const h = harness([{ text: '不是 JSON' }, { text: GOOD }]);
    expect((await start(h).run()).status).toBe('completed');
    expect(h.commits).toHaveLength(1);
  });

  it('other errors (401) are not retried', async () => {
    const h = harness([{ error: 'other', message: '401' }, { text: GOOD }]);
    const report = await start(h).run();
    expect(report.status).toBe('blocked');
    expect(h.prompts).toHaveLength(1);
    expect(h.commits).toHaveLength(0);
    expect(report.job.units[0]?.status).toBe('pending');
  });

  it('quota pauses without retry', async () => {
    const h = harness([{ error: 'quota_exhausted' }]);
    const report = await start(h).run();
    expect(report.status).toBe('paused');
    expect(report.job.pauseReason).toBe('quota_exhausted');
    expect(h.prompts).toHaveLength(1);
  });

  it('R6 not passing: nothing is sent', async () => {
    const h = harness([{ text: GOOD }], {
      fake: { route: { executionMode: { outcome: 'failed', basis: 'fake' } } },
    });
    const report = await start(h).run();
    expect(report.status).toBe('blocked');
    expect(h.prompts).toHaveLength(0);
    expect(h.records[0]?.executed).toBe(false);
  });

  it('snapshot lost confirmation before sending: not sent', async () => {
    const h = harness([{ text: GOOD }], {
      inputs: { message: message(), jobSnapshot: snapshot({ confirmedAt: null }), claims: [] },
    });
    const report = await start(h).run();
    expect(report).toMatchObject({ status: 'not_sent', reason: 'snapshot_not_confirmed' });
    expect(h.prompts).toHaveLength(0);
  });

  it('cancelled before sending: pauses and the runner does not resume by itself', async () => {
    const fake = createFakeAdapter({ script: [{ text: GOOD }] });
    // pipeline 不依賴 DOM／Node 型別：用最小的假取消訊號
    const signal = { aborted: true, addEventListener: () => undefined };
    const base = harness([]).deps;
    const plan = makePlan();
    const runner = createDraftRunner(plan, createWorkRun(plan.jobId, [plan.unitId]), {
      ...base,
      execute: ({ prompt }) =>
        runWithSubscriptionCheck(
          fake,
          { model: 'fake-model', prompt, trigger: 'run_start', signal: signal as never },
          { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'run-check' },
        ),
    });
    const report = await runner.run();
    expect(report.status).toBe('paused');
    expect(report.job.pauseReason).toBe('user_cancelled');
    expect(fake.calls.prompts).toHaveLength(0);
    expect((await runner.run()).status).toBe('not_running');
  });
});
