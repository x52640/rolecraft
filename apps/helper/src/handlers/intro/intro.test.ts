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
    expect(await env.send(get)).toEqual({
      ok: true,
      intro: null,
      check: null,
      generation: null,
      draft: null,
    });
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
      draft: null,
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
      // P1-T071：沒通過的輸出保留成草稿（不存檔、不能複製）
      draft: expect.objectContaining({ problem }) as unknown,
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

describe('未通過草稿（P1-T071）', () => {
  const BAD = json('載入時間縮短 40%，服務 12 萬名使用者。');
  const saveDraft = (text: string) => ({
    op: 'intro.update',
    payload: { jobSnapshotId: JOB, text, draft: true },
  });
  const fix = { op: 'intro.generate', payload: { jobSnapshotId: JOB, fix: true } };

  /** 第一次回 first，之後依序回 rest（用完重複最後一個）。 */
  function scripted(...steps: FakeStep[]) {
    let i = 0;
    return () => steps[Math.min(i++, steps.length - 1)] as FakeStep;
  }

  async function fixed(env: Env): Promise<unknown> {
    const done = env.settled();
    expect(await env.send(fix)).toMatchObject({ ok: true, generation: { state: 'running' } });
    await done;
    return env.send(get);
  }

  it('沒通過：草稿可見（文字、問題、問題片段），不存成自介', async () => {
    const env = open(() => BAD);
    expect(await generated(env)).toMatchObject({
      intro: null,
      check: null,
      generation: { state: 'failed', failure: 'check_failed', problem: 'number_not_grounded' },
      draft: {
        text: '載入時間縮短 40%，服務 12 萬名使用者。',
        citations: [{ claimId: 'c-metric' }],
        problem: 'number_not_grounded',
        fragments: [expect.stringContaining('12') as unknown],
      },
    });
    expect(env.repos.applicationIntros.get(JOB)).toBeNull();
  });

  it('在草稿上修改並儲存：通過才成為正式自介（經使用者編輯），草稿與失敗狀態清掉', async () => {
    const env = open(() => BAD);
    await generated(env);
    expect(await env.send(saveDraft('載入時間縮短 40%，期待貢獻所長。'))).toMatchObject({
      ok: true,
      intro: { text: '載入時間縮短 40%，期待貢獻所長。', userEdited: true },
      check: { problem: null },
    });
    expect(await env.send(get)).toMatchObject({ generation: null, draft: null });
    expect(env.engine.prompts).toHaveLength(1);
  });

  it('儲存草稿仍沒通過：invalid_request，不存檔；修改與新的問題留在草稿上', async () => {
    const env = open(() => BAD);
    await generated(env);
    expect(await env.send(saveDraft('載入時間縮短 40%，服務 99 人。'))).toMatchObject(INVALID);
    expect(env.repos.applicationIntros.get(JOB)).toBeNull();
    expect(await env.send(get)).toMatchObject({
      draft: { text: '載入時間縮短 40%，服務 99 人。', problem: 'number_not_grounded' },
    });
  });

  it('草稿源自模型：儲存時承諾字眼照樣擋（不是只提示）', async () => {
    const env = open(() => BAD);
    await generated(env);
    expect(await env.send(saveDraft('載入時間縮短 40%，薪資面議。'))).toMatchObject(INVALID);
    expect(await env.send(get)).toMatchObject({
      intro: null,
      draft: { problem: 'commits_salary' },
    });
  });

  it('請 AI 修正：使用者按才送，把草稿與問題回饋給模型；修正後合格就存成自介', async () => {
    const env = open(scripted(BAD, GOOD));
    await generated(env);
    expect(await fixed(env)).toMatchObject({
      intro: { text: expect.stringContaining('40%') as unknown, userEdited: false },
      generation: { state: 'succeeded' },
      draft: null,
    });
    expect(env.engine.prompts).toHaveLength(2);
    const prompt = env.engine.prompts[1] ?? '';
    expect(prompt).toContain('<<<DATA PREVIOUS_DRAFT');
    expect(prompt).toContain('服務 12 萬名使用者');
    expect(prompt).toContain('<<<DATA PROBLEM_FRAGMENTS');
    expect(prompt).toContain('上一版沒有通過檢查：有數字沒有出處');
    expect(env.engine.prompts[0]).not.toContain('PREVIOUS_DRAFT');
  });

  it('請 AI 修正後仍沒通過：換成新的草稿；沒有草稿時回 invalid_request，不呼叫模型', async () => {
    const empty = open(() => GOOD);
    expect(await empty.send(fix)).toMatchObject(INVALID);
    expect(empty.engine.prompts).toHaveLength(0);

    const env = open(scripted(BAD, json('載入時間縮短 40%，服務 77 人。')));
    await generated(env);
    expect(await fixed(env)).toMatchObject({
      intro: null,
      draft: { text: '載入時間縮短 40%，服務 77 人。', problem: 'number_not_grounded' },
    });
  });

  it('草稿產生後已存自介被使用者改過：儲存草稿不覆蓋', async () => {
    const env = open(scripted(GOOD, BAD));
    await generated(env);
    await generated(env); // 重新產生沒通過 → 草稿；已存自介仍是第一份
    await env.send(update('我自己改寫的版本，載入時間縮短 40%。'));
    expect(await env.send(saveDraft('載入時間縮短 40%。'))).toMatchObject({
      ...INVALID,
      error: { message: expect.stringContaining('不蓋掉') as unknown },
    });
    expect(env.repos.applicationIntros.get(JOB)).toMatchObject({
      text: '我自己改寫的版本，載入時間縮短 40%。',
    });
  });

  it('草稿產生後已存自介被改過：請 AI 修正先比對，不呼叫模型並說明原因，草稿與自介都不動', async () => {
    const env = open(scripted(GOOD, BAD, GOOD));
    await generated(env);
    await generated(env); // 重新產生沒通過 → 草稿；已存自介仍是第一份
    await env.send(update('我自己改寫的版本，載入時間縮短 40%。'));
    expect(await env.send(fix)).toMatchObject({
      ...INVALID,
      error: { message: expect.stringContaining('沒有呼叫 AI') as unknown },
    });
    expect(env.engine.prompts).toHaveLength(2);
    expect(await env.send(get)).toMatchObject({
      intro: { text: '我自己改寫的版本，載入時間縮短 40%。' },
      draft: { problem: 'number_not_grounded' },
    });
  });

  it('草稿產生後快照被修改並重新確認：不能修正、也不能存成自介', async () => {
    const env = open(() => BAD);
    await generated(env);
    env.repos.jobSnapshots.save(snapshot({ confirmedAt: '2026-10-12T09:00:00.000Z' }));
    expect(await env.send(fix)).toMatchObject(INVALID);
    expect(await env.send(saveDraft('載入時間縮短 40%。'))).toMatchObject(INVALID);
    expect(env.repos.applicationIntros.get(JOB)).toBeNull();
    expect(env.engine.prompts).toHaveLength(1);
  });

  it('重新產生（不是修正）先捨棄舊草稿；產生中不能儲存草稿', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const env = open(async () => {
      calls += 1;
      if (calls === 2) await hold;
      return calls === 1 ? BAD : GOOD;
    });
    await generated(env);
    const done = env.settled();
    await env.send(generate);
    expect(await env.send(get)).toMatchObject({ draft: null });
    expect(await env.send(saveDraft('載入時間縮短 40%。'))).toMatchObject(INVALID);
    release();
    await done;
    expect(await env.send(get)).toMatchObject({ intro: { userEdited: false }, draft: null });
  });
});

describe('公司名稱裡的數字（P1-T071）', () => {
  const named = (env: Env, confirmedAt?: string | null) => {
    const base = snapshot();
    env.repos.jobSnapshots.save({
      ...base,
      fields: { ...base.fields, company: '104資訊科技' },
      ...(confirmedAt === undefined ? {} : { confirmedAt }),
    });
  };

  it('產生的自介寫到公司名稱（含數字）可以通過；名稱外的同一個數字不行', async () => {
    const env = open(() => json('您好，應徵104資訊科技，曾讓載入時間縮短 40%。'));
    named(env);
    expect(await generated(env)).toMatchObject({
      intro: { text: expect.stringContaining('104資訊科技') as unknown },
      check: { problem: null },
      generation: { state: 'succeeded' },
    });
    expect(await env.send(update('載入時間縮短 40%，服務 104 位使用者。'))).toMatchObject({
      check: { problem: 'number_not_grounded' },
    });
  });

  it('快照之後取消確認：名稱裡的數字不再算有出處', async () => {
    const env = open(() => json('您好，應徵104資訊科技，曾讓載入時間縮短 40%。'));
    named(env);
    await generated(env);
    named(env, null);
    expect(await env.send(get)).toMatchObject({ check: { problem: 'number_not_grounded' } });
  });
});
