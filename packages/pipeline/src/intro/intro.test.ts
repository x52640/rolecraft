// P1-T064 投遞自介（D25）：送出前準備、提示隔離、輸出檢查（字數、引用、D14、數字、承諾字眼）。
// 一律用假 provider，不呼叫真實 CLI。
import type { Claim, RunCheckRecord } from '@rolecraft/contracts';
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
  profile,
  snapshot,
} from '../generation/fixtures.test-helpers.ts';
import { checkIntro, introCommitmentWarning } from './check.ts';
import { parseIntroOutput } from './output.ts';
import { prepareIntro, type PreparedIntro } from './prepare.ts';
import { runIntro } from './run.ts';

const inputs = (over: { claims?: readonly Claim[]; confirmedAt?: string | null } = {}) => ({
  jobSnapshot: snapshot(over.confirmedAt === undefined ? {} : { confirmedAt: over.confirmedAt }),
  profile: profile(),
  claims: over.claims ?? [...CLAIMS, ...UNUSABLE],
});

function prepared(): PreparedIntro {
  const result = prepareIntro('job-1', inputs(), budget(200_000), idSource('p'));
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

const json = (intro: string, citations: object[] = [{ claim: 'C3' }]) =>
  JSON.stringify({ intro, citations });

async function run(step: FakeStep, fake: FakeAdapterOptions = {}) {
  const adapter = createFakeAdapter({ script: [step], ...fake });
  const records: RunCheckRecord[] = [];
  const result = await runIntro(prepared(), {
    provider: 'claude',
    model: 'fake-model',
    execute: ({ prompt }) =>
      runWithSubscriptionCheck(
        adapter,
        { model: 'fake-model', prompt, trigger: 'run_start' },
        { parentEnv: { PATH: '/usr/bin' }, now: () => new Date(0), newId: () => 'run-check' },
      ),
    signal: 'signal',
    recordRunCheck: (record) => {
      records.push(record);
      return Promise.resolve();
    },
  });
  return { result, records, prompts: adapter.calls.prompts };
}

describe('送出前準備', () => {
  it('快照未確認、沒有可用事實項、超過預算：不送出', () => {
    const id = idSource('p');
    expect(prepareIntro('job-1', inputs({ confirmedAt: null }), budget(1e6), id)).toEqual({
      ok: false,
      reason: 'snapshot_not_confirmed',
    });
    expect(prepareIntro('job-1', inputs({ claims: UNUSABLE }), budget(1e6), id)).toEqual({
      ok: false,
      reason: 'no_usable_claims',
    });
    expect(prepareIntro('other', inputs(), budget(1e6), id)).toMatchObject({
      reason: 'snapshot_missing',
    });
    expect(prepareIntro('job-1', inputs(), budget(10), id)).toMatchObject({
      reason: 'over_budget',
    });
  });

  it('提示：職缺與事實項放在資料區塊；不可用事實項與聯絡資訊欄位不送', () => {
    const { prompt, claims } = prepared();
    expect(claims.map((c) => c.id)).toEqual(CLAIMS.map((c) => c.id));
    const injectionAt = prompt.indexOf(INJECTION);
    const blockStart = prompt.lastIndexOf('<<<DATA JOB_DESCRIPTION', injectionAt);
    expect(blockStart).toBeGreaterThan(0);
    expect(prompt.indexOf('<<<END JOB_DESCRIPTION', injectionAt)).toBeGreaterThan(injectionAt);
    expect(prompt).not.toContain('金流串接');
    expect(prompt).not.toContain('王小明');
    expect(prompt).toContain('甲公司');
    expect(prompt).toContain('C2（功能，狀態：使用者確認完成，最高可寫：已完成）');
  });

  it('個人資料未確認：不送進提示', () => {
    const raw = { ...inputs(), profile: profile({ pdfParseConfirmed: false }) };
    const result = prepareIntro('job-1', raw, budget(200_000), idSource('p'));
    expect(result.ok && result.prepared.profile).toBeNull();
    expect(result.ok && result.prepared.prompt).not.toContain('甲公司');
  });
});

describe('執行與檢查', () => {
  it('合格自介：引用換成事實項 ID；R6 紀錄照存', async () => {
    const { result, records } = await run({
      text: json('您好，我在前端專案負責登入功能，載入時間縮短 40%，期待貢獻所長。', [
        { claim: 'C1', statedCompletion: 'in_progress' },
        { claim: 'C3' },
      ]),
    });
    expect(result).toEqual({
      ok: true,
      text: expect.stringContaining('40%') as unknown,
      citations: [
        { claimId: 'claim-doc-done', statedCompletion: 'in_progress' },
        { claimId: 'claim-metric' },
      ],
    });
    expect(records).toHaveLength(1);
  });

  it.each([
    ['超過 300 字', json('經'.repeat(301)), 'too_long'],
    ['引用不存在', json('我負責登入功能。', [{ claim: 'C9' }]), 'unknown_claim'],
    ['沒有引用', json('我是工程師。', []), 'no_citation'],
    [
      '未確認的功能寫成已完成',
      json('我完成了登入功能。', [{ claim: 'C1', statedCompletion: 'completed' }]),
      'completion_exceeds_claim',
    ],
    ['數字無依據', json('載入時間縮短 55%。'), 'number_not_grounded'],
    ['承諾薪資', json('載入時間縮短 40%，期望薪資面議。'), 'commits_salary'],
    ['承諾到職日', json('載入時間縮短 40%，可立刻到職。'), 'commits_start_date'],
  ])('%s：不採用並回原因', async (_name, text, problem) => {
    const { result } = await run({ text });
    expect(result).toEqual({ ok: false, failure: 'check_failed', problem });
  });

  it('剛好 300 字可以；使用者確認完成的可寫成已完成；個人資料的年份算依據', async () => {
    const body = '我自 2021 年起在甲公司負責匯出 PDF。';
    const intro = body + '。'.repeat(300 - [...body].length);
    const { result } = await run({
      text: json(intro, [{ claim: 'C2', statedCompletion: 'completed' }]),
    });
    expect(result.ok).toBe(true);
  });

  it('格式不合格、R6 不通過、額度用完：各自回原因；R6 不通過時不送出', async () => {
    expect((await run({ text: '不是 JSON' })).result).toMatchObject({
      failure: 'invalid_output',
    });
    const blocked = await run(
      { text: json('載入時間縮短 40%。') },
      { route: { executionMode: { outcome: 'failed', basis: 'fake' } } },
    );
    expect(blocked.result).toMatchObject({ failure: 'run_check_failed' });
    expect(blocked.prompts).toHaveLength(0);
    expect(blocked.records[0]?.executed).toBe(false);
    expect((await run({ error: 'quota_exhausted' })).result).toMatchObject({
      failure: 'quota_exhausted',
    });
  });
});

describe('使用者編輯後重跑檢查', () => {
  const ctx = { claims: CLAIMS, profile: profile() };
  const cited = [{ claimId: 'claim-metric' }];

  it('加入無依據數字或承諾字眼就不通過；改回有依據就通過', () => {
    expect(checkIntro('載入時間縮短 40%。', cited, ctx)).toBeNull();
    expect(checkIntro('載入時間縮短 40%，服務 3000 位使用者。', cited, ctx)).toBe(
      'number_not_grounded',
    );
    // D25：使用者自己加的承諾字眼不算檢查問題，只另外提示
    expect(checkIntro('載入時間縮短 40%，明天就能面試。', cited, ctx)).toBeNull();
    expect(introCommitmentWarning('載入時間縮短 40%，明天就能面試。')).toBe('commits_time');
    expect(introCommitmentWarning('載入時間縮短 40%。')).toBeNull();
    expect(checkIntro('   ', cited, ctx)).toBe('empty');
  });

  it('引用的事實項已不可用（不在目前清單）：不通過', () => {
    expect(checkIntro('載入時間縮短 40%。', cited, { claims: [], profile: null })).toBe(
      'unknown_claim',
    );
  });

  it('輸出格式：多餘欄位、完成程度不合法都整份不合格', () => {
    expect(parseIntroOutput(JSON.stringify({ intro: 'x', citations: [], extra: 1 })).ok).toBe(
      false,
    );
    const bad = { intro: 'x', citations: [{ claim: 'C1', statedCompletion: 'done' }] };
    expect(parseIntroOutput(JSON.stringify(bad)).ok).toBe(false);
    expect(parseIntroOutput('```json\n{"intro":"x","citations":[]}\n```').ok).toBe(true);
  });
});

describe('對抗驗證修正', () => {
  it.each([['\u200B\u200B'], ['\u200D\uFEFF\u2060'], ['\u3000\u200B']])(
    '只有零寬／格式字元也算空白（%j）',
    (text) => {
      expect(
        checkIntro(text, [{ claimId: 'claim-metric' }], { claims: CLAIMS, profile: null }),
      ).toBe('empty');
    },
  );

  it('模型只輸出零寬字元：不採用', async () => {
    const { result } = await run({ text: json('\u200B') });
    expect(result).toEqual({ ok: false, failure: 'check_failed', problem: 'empty' });
  });
});
