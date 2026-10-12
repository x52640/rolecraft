// intro.*（P1-T064，D25）：真實 SQLite（記憶體）＋假 provider（createFakeAdapter＋runWithSubscriptionCheck），
// 不呼叫真實 CLI。驗：合格才存檔、不合格回原因、撤銷來源的事實項不進輸入、未選模型不送、編輯後重跑檢查。
import type { BridgeRequest, Claim } from '@rolecraft/contracts';
import type { FakeStep } from '@rolecraft/providers';
import { createRepositories, openDatabase, type Repositories } from '@rolecraft/storage';
import { afterEach, describe, expect, it } from 'vitest';

import { recordingLogger } from '../../__fixtures__/requests.ts';
import { dispatch } from '../../bridge/dispatch.ts';
import { fakeEngine, type FakeEngine } from '../analysis/__fixtures__/analysis-env.ts';
import { CLAIMS, JOB, PROFILE, snapshot } from '../resume/__fixtures__/resume-db.ts';
import type { ClaimGate } from '../sources/claim-gate.ts';
import { createIntroService } from './intro-service.ts';

const INVALID = { ok: false, error: { code: 'invalid_request' } };
/** 提示中的事實項：C1 c-done（確認完成）、C2 c-doc（文件標示完成）、C3 c-metric（40%）；c-review 不可用。 */
const json = (intro: string, citations: object[] = [{ claim: 'C3' }]) => ({
  text: JSON.stringify({ intro, citations }),
});
const GOOD = json('您好，我在甲公司負責前端，曾讓載入時間縮短 40%，期待貢獻所長。');

interface Env {
  repos: Repositories;
  engine: FakeEngine;
  send(request: BridgeRequest | Record<string, unknown>): Promise<unknown>;
  settled(): Promise<void>;
  cleanup(): void;
}

const envs: Env[] = [];
afterEach(() => {
  while (envs.length) envs.pop()?.cleanup();
});

function open(
  respond: (prompt: string) => FakeStep | Promise<FakeStep>,
  options: { claims?: Claim[]; gate?: ClaimGate } = {},
): Env {
  const { db } = openDatabase(':memory:');
  const repos = createRepositories(db);
  repos.profiles.save(PROFILE);
  repos.jobSnapshots.save(snapshot());
  for (const claim of options.claims ?? CLAIMS) repos.claims.save(claim);
  let waiters: (() => void)[] = [];
  const engine = fakeEngine(() => ({ text: '' }));
  const base = engine.engine;
  // 讓測試能在模型回覆前插入動作：respond 可回 Promise
  const wrapped = {
    select: async () => {
      const selection = await base.select();
      if (!selection) return null;
      return {
        ...selection,
        execute: async (request: { prompt: string; signal: AbortSignal }) => {
          const step = await respond(request.prompt);
          const inner = fakeEngine(() => step);
          const chosen = await inner.engine.select();
          engine.prompts.push(request.prompt);
          if (!chosen) throw new Error('unreachable');
          return chosen.execute(request);
        },
      };
    },
  };
  const service = createIntroService({
    db,
    repos,
    engine: { select: () => (engine.selectable ? wrapped.select() : Promise.resolve(null)) },
    gate: options.gate ?? null,
    now: () => Date.parse('2026-10-12T01:00:00.000Z'),
    onSettled: () => {
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
  });
  const services = { intro: service };
  const env: Env = {
    repos,
    engine,
    send: async (request) => (await dispatch(request, services, recordingLogger())).response,
    settled: () => new Promise((resolve) => waiters.push(resolve)),
    cleanup: () => db.close(),
  };
  envs.push(env);
  return env;
}

const generate = { op: 'intro.generate', payload: { jobSnapshotId: JOB } };
const get = { op: 'intro.get', payload: { jobSnapshotId: JOB } };
const update = (text: string) => ({ op: 'intro.update', payload: { jobSnapshotId: JOB, text } });

async function generated(env: Env): Promise<unknown> {
  const done = env.settled();
  expect(await env.send(generate)).toEqual({
    ok: true,
    generation: { state: 'running', failure: null, problem: null },
  });
  await done;
  return env.send(get);
}

describe('intro.generate／intro.get', () => {
  it('合格自介：存檔、可取回、檢查通過；R6 紀錄照存', async () => {
    const env = open(() => GOOD);
    expect(await env.send(get)).toEqual({ ok: true, intro: null, check: null, generation: null });
    expect(await generated(env)).toEqual({
      ok: true,
      intro: {
        jobSnapshotId: JOB,
        text: expect.stringContaining('40%') as unknown,
        citations: [{ claimId: 'c-metric' }],
        generatedAt: '2026-10-12T01:00:00.000Z',
        userEdited: false,
      },
      check: {
        length: expect.any(Number) as unknown,
        problem: null,
        warning: null,
        citations: [
          {
            claimId: 'c-metric',
            text: '載入時間縮短 40%',
            type: 'outcome_metric',
            completionStatus: null,
            statedCompletion: null,
            usable: true,
          },
        ],
      },
      generation: { state: 'succeeded', failure: null, problem: null },
    });
    expect(env.repos.runCheckRecords.listByProvider('claude')).toHaveLength(1);
    expect(env.engine.prompts[0]).not.toContain('金流串接');
  });

  it.each([
    ['超過 300 字', json('經'.repeat(301)), 'too_long'],
    ['引用不存在', json('我負責登入功能。', [{ claim: 'C9' }]), 'unknown_claim'],
    [
      '未確認事實寫成已完成',
      json('我完成了登入功能。', [{ claim: 'C2', statedCompletion: 'completed' }]),
      'completion_exceeds_claim',
    ],
    ['數字無依據', json('載入時間縮短 70%。'), 'number_not_grounded'],
    ['承諾薪資', json('載入時間縮短 40%，薪資可議。'), 'commits_salary'],
    ['承諾面試時間', json('載入時間縮短 40%，隨時可以面試。'), 'commits_time'],
    ['承諾到職日', json('載入時間縮短 40%，可配合到職。'), 'commits_start_date'],
  ])('%s：不採用、不存檔，回原因', async (_name, step, problem) => {
    const env = open(() => step);
    expect(await generated(env)).toEqual({
      ok: true,
      intro: null,
      check: null,
      generation: { state: 'failed', failure: 'check_failed', problem },
    });
    expect(env.repos.applicationIntros.get(JOB)).toBeNull();
  });

  it('快照未確認、沒有可用事實項、未選模型：回 invalid_request，不呼叫模型', async () => {
    const unconfirmed = open(() => GOOD);
    unconfirmed.repos.jobSnapshots.save(snapshot({ confirmedAt: null }));
    expect(await unconfirmed.send(generate)).toMatchObject(INVALID);

    const noClaims = open(() => GOOD, { claims: CLAIMS.filter((c) => c.id === 'c-review') });
    expect(await noClaims.send(generate)).toMatchObject({
      ...INVALID,
      error: { message: expect.stringContaining('事實項') as unknown },
    });

    const noModel = open(() => GOOD);
    noModel.engine.selectable = false;
    expect(await noModel.send(generate)).toMatchObject({
      ...INVALID,
      error: { message: expect.stringContaining('選定') as unknown },
    });
    expect(
      await noModel.send({ op: 'intro.generate', payload: { jobSnapshotId: 'nope' } }),
    ).toMatchObject(INVALID);
    for (const env of [unconfirmed, noClaims, noModel]) expect(env.engine.prompts).toHaveLength(0);
  });

  it('撤銷來源的事實項不進輸入；已存的自介引用它就檢查不通過', async () => {
    let revoked = false;
    const gate: ClaimGate = {
      refresh: () => Promise.resolve(),
      apply: (claims) =>
        claims.map((c) =>
          revoked && c.id === 'c-metric' ? { ...c, reviewStatus: 'source_removed' as const } : c,
        ),
    };
    const env = open(() => GOOD, { gate });
    await generated(env);
    revoked = true;
    expect(await env.send(get)).toMatchObject({ check: { problem: 'unknown_claim' } });
    await generated(env);
    expect(env.engine.prompts[1]).not.toContain('載入時間縮短 40%');
  });

  it('同時按兩次只送一次；產生期間使用者改過自介就不覆蓋', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    let first = true;
    const env = open(async () => {
      if (!first) await hold;
      first = false;
      return GOOD;
    });
    await generated(env);
    const done = env.settled();
    await Promise.all([env.send(generate), env.send(generate)]);
    await env.send(update('我自己改寫的版本，載入時間縮短 40%。'));
    release();
    await done;
    expect(env.engine.prompts).toHaveLength(2);
    expect(await env.send(get)).toMatchObject({
      intro: { text: '我自己改寫的版本，載入時間縮短 40%。', userEdited: true },
      generation: { state: 'failed', failure: 'intro_changed' },
    });
  });

  it('產生期間快照被修改（取消確認）：不寫入', async () => {
    const env = open(() => {
      env.repos.jobSnapshots.save(snapshot({ confirmedAt: null, userModified: true }));
      return GOOD;
    });
    expect(await generated(env)).toMatchObject({
      intro: null,
      generation: { state: 'failed', failure: 'snapshot_changed' },
    });
  });
});

describe('intro.update', () => {
  it('編輯後重跑檢查：加入無依據數字就不通過，改回後通過', async () => {
    const env = open(() => GOOD);
    await generated(env);
    expect(await env.send(update('載入時間縮短 40%，服務 3000 位使用者。'))).toMatchObject({
      ok: true,
      intro: { userEdited: true },
      check: { problem: 'number_not_grounded' },
    });
    expect(await env.send(update('載入時間縮短 40%。'))).toMatchObject({
      check: { length: 11, problem: null },
    });
    expect(await env.send(update('經'.repeat(301)))).toMatchObject({
      check: { length: 301, problem: 'too_long' },
    });
  });

  it('沒有自介或快照不存在：invalid_request', async () => {
    const env = open(() => GOOD);
    expect(await env.send(update('x'))).toMatchObject(INVALID);
    expect(
      await env.send({ op: 'intro.update', payload: { jobSnapshotId: 'nope', text: 'x' } }),
    ).toMatchObject(INVALID);
    expect(await env.send({ op: 'intro.get', payload: { jobSnapshotId: 'nope' } })).toMatchObject(
      INVALID,
    );
  });
});

describe('對抗驗證與擁有者裁定（D25）', () => {
  it('使用者編輯加入承諾字眼：只提示（warning），不算檢查問題', async () => {
    const env = open(() => GOOD);
    await generated(env);
    expect(await env.send(update('載入時間縮短 40%，期望薪資面議。'))).toMatchObject({
      ok: true,
      check: { problem: null, warning: 'commits_salary' },
    });
  });

  it('儲存只有零寬字元的內容：檢查判為空白', async () => {
    const env = open(() => GOOD);
    await generated(env);
    expect(await env.send(update('\u200B\u200B'))).toMatchObject({
      check: { problem: 'empty' },
    });
  });

  it('引用對照：事實項變成不可用時標示，並帶目前狀態與寫成的完成程度', async () => {
    const env = open(() =>
      json('我負責登入功能的開發。', [{ claim: 'C2', statedCompletion: 'in_progress' }]),
    );
    await generated(env);
    const doc = env.repos.claims.list().find((c) => c.id === 'c-doc');
    if (!doc) throw new Error('missing');
    env.repos.claims.save({ ...doc, reviewStatus: 'needs_review' });
    expect(await env.send(get)).toMatchObject({
      check: {
        problem: 'unknown_claim',
        citations: [
          {
            claimId: 'c-doc',
            text: '登入功能',
            completionStatus: 'documented_done',
            statedCompletion: 'in_progress',
            usable: false,
          },
        ],
      },
    });
  });
});
