// analysis.start／analysis.status 端到端（P1-T060）：暫存資料區＋假資料夾＋假 provider，不呼叫任何真實 CLI。
import { AnalysisStatusView, BRIDGE_SCHEMAS } from '@rolecraft/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  authorize,
  fakeEngine,
  feature,
  output,
  testDataDir,
  type TestDataDir,
} from './__fixtures__/analysis-env.ts';

const A = '# 專案甲\n\n完成登入功能。';
const B = '# 專案乙\n\n計畫中：匯出 PDF。';
const OUT_A = output([feature('登入功能', '完成登入功能。')], '甲的摘要');
const OUT_B = output([feature('匯出 PDF', '計畫中：匯出 PDF。', 'planned')], '乙的摘要');
const byDoc = (prompt: string) => (prompt.includes('專案甲') ? OUT_A : OUT_B);

let env: TestDataDir;
afterEach(() => env.cleanup());

const status = async (run: { call: (op: 'analysis.status') => Promise<object> }) => {
  const res = await run.call('analysis.status');
  expect(BRIDGE_SCHEMAS['analysis.status'].response.safeParse(res).success).toBe(true);
  return (res as { analysis: AnalysisStatusView | null }).analysis;
};

describe('analysis：授權資料夾 → 事實項', () => {
  it('分析已授權文件、寫入有來源的事實項、狀態完成；沒有變更時不再呼叫模型', async () => {
    env = testDataDir({ 'README.md': A, 'notes.md': '待確認的文件，不能讀' });
    const run = env.open(fakeEngine(byDoc));
    await authorize(run, { authorize: ['README.md'] });
    expect(await status(run)).toBeNull();

    const started = await run.call('analysis.start');
    expect(BRIDGE_SCHEMAS['analysis.start'].response.safeParse(started).success).toBe(true);
    expect(started).toMatchObject({ ok: true, workJobId: expect.any(String) as unknown });
    expect(await run.settled()).toBe(started.workJobId);

    const claims = run.repos.claims.list();
    expect(claims.map((c) => [c.text, c.reviewStatus, c.completionStatus])).toEqual([
      ['登入功能', 'normal', 'documented_done'],
    ]);
    expect(claims[0]?.basis.userConfirmation).toBeNull();
    expect(await status(run)).toMatchObject({
      workJobId: started.workJobId,
      state: 'completed',
      completedUnits: 1,
      totalUnits: 1,
      claimsAdded: 1,
    });
    // R4：只讀授權集合，每次讀取都留紀錄；待確認的文件內容沒有送出
    const reads = run.repos.sourceReadLog.list();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.relPath === 'README.md')).toBe(true);
    expect(run.fake.prompts.join('')).not.toContain('待確認的文件');

    expect(await run.call('analysis.start')).toEqual({ ok: true, workJobId: null });
    expect(run.fake.prompts).toHaveLength(1);
  });

  it('沒有選定模型：不讀檔、不呼叫模型', async () => {
    env = testDataDir({ 'README.md': A });
    const fake = fakeEngine(byDoc);
    fake.selectable = false;
    const run = env.open(fake);
    await authorize(run, { authorize: ['README.md'] });
    expect(await run.call('analysis.start')).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(run.repos.sourceReadLog.list()).toEqual([]);
    expect(fake.prompts).toEqual([]);
  });

  it('R6 不通過：工作被擋、不寫入；狀態顯示被擋', async () => {
    env = testDataDir({ 'README.md': A });
    const failed = { outcome: 'failed', basis: 'fake：API key 登入' } as const;
    const run = env.open(fakeEngine(byDoc, { route: { subscriptionLogin: failed } }));
    await authorize(run, { authorize: ['README.md'] });
    await run.call('analysis.start');
    await run.settled();
    expect(run.repos.claims.list()).toEqual([]);
    expect(await status(run)).toMatchObject({
      state: 'blocked',
      blockReason: 'run_check_failed',
      pauseReason: null,
      completedUnits: 0,
    });
    expect(run.repos.runCheckRecords.listByProvider('claude').length).toBeGreaterThan(0);
  });
});

describe('analysis：暫停、重開與手動續跑（R9、D21）', () => {
  it('額度用完暫停 → 重開後狀態仍在、不自動續跑 → 使用者續跑從未完成單元開始', async () => {
    env = testDataDir({ 'README.md': A, 'plan.md': B });
    let first = '';
    const before = env.open(
      fakeEngine((prompt) => {
        if (first === '') first = prompt.includes('專案甲') ? '甲' : '乙';
        const isFirst = prompt.includes(first === '甲' ? '專案甲' : '專案乙');
        return isFirst ? byDoc(prompt) : { error: 'quota_exhausted' };
      }),
    );
    await authorize(before, { authorize: ['README.md', 'plan.md'] });
    const started = await before.call('analysis.start');
    await before.settled();
    const paused = await status(before);
    expect(paused).toMatchObject({
      state: 'paused',
      pauseReason: 'quota_exhausted',
      completedUnits: 1,
      totalUnits: 2,
      claimsAdded: 1,
    });

    // 重開 helper：狀態從資料區讀回；不自動續跑
    const fake = fakeEngine(byDoc);
    const after = env.open(fake);
    expect(await status(after)).toEqual(paused);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.prompts).toEqual([]);

    // 使用者續跑：先重做 R6，同一個工作，只送未完成的那份
    expect(await after.call('analysis.start')).toEqual({ ok: true, workJobId: started.workJobId });
    await after.settled();
    expect(fake.rechecks).toBe(1);
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0]).toContain(first === '甲' ? '專案乙' : '專案甲');
    expect(await status(after)).toMatchObject({
      workJobId: started.workJobId,
      state: 'completed',
      completedUnits: 2,
      claimsAdded: 2,
    });
    expect(
      after.repos.claims
        .list()
        .map((c) => c.text)
        .sort(),
    ).toEqual(['匯出 PDF', '登入功能']);
  });

  it('續跑前 R6 重新檢查不通過：不續跑、不讀檔', async () => {
    env = testDataDir({ 'README.md': A });
    const run = env.open(fakeEngine(() => ({ error: 'quota_exhausted' })));
    await authorize(run, { authorize: ['README.md'] });
    await run.call('analysis.start');
    await run.settled();
    const fake = fakeEngine(byDoc);
    fake.recheckPasses = false;
    const after = env.open(fake);
    const reads = after.repos.sourceReadLog.list().length;
    expect(await after.call('analysis.start')).toMatchObject({
      ok: false,
      error: { code: 'invalid_request' },
    });
    expect(after.repos.sourceReadLog.list()).toHaveLength(reads);
    expect(fake.prompts).toEqual([]);
    expect(await status(after)).toMatchObject({ state: 'paused', pauseReason: 'quota_exhausted' });
  });

  it('暫停期間文件內容變了：不沿用舊計畫，重新規劃新工作', async () => {
    env = testDataDir({ 'README.md': A });
    const run = env.open(fakeEngine(() => ({ error: 'quota_exhausted' })));
    await authorize(run, { authorize: ['README.md'] });
    const old = await run.call('analysis.start');
    await run.settled();
    env.files.set('README.md', `${A}\n\n另外完成搜尋功能。`);
    const fake = fakeEngine(() => output([feature('搜尋功能', '另外完成搜尋功能。')]));
    const after = env.open(fake);
    const fresh = await after.call('analysis.start');
    expect(fresh.workJobId).not.toBe(old.workJobId);
    await after.settled();
    expect(await status(after)).toMatchObject({ workJobId: fresh.workJobId, state: 'completed' });
    expect(after.repos.claims.list().map((c) => c.text)).toEqual(['搜尋功能']);
  });
});

describe('analysis：撤銷授權與恢復（R2、擁有者裁定 #15）', () => {
  it('撤銷後再分析：事實項標來源已移除；同內容重新授權恢復，不呼叫模型', async () => {
    env = testDataDir({ 'README.md': A });
    const run = env.open(fakeEngine(byDoc));
    await authorize(run, { authorize: ['README.md'] });
    await run.call('analysis.start');
    await run.settled();

    await authorize(run, { revoke: ['README.md'] });
    expect(await run.call('analysis.start')).toEqual({ ok: true, workJobId: null });
    const [removed] = run.repos.claims.list();
    expect(removed?.reviewStatus).toBe('source_removed');
    expect(removed?.revocationHold?.previousStatus).toBe('normal');
    expect(run.repos.sourceDocuments.list()[0]?.authorizationStatus).toBe('revoked');

    await authorize(run, { authorize: ['README.md'] });
    expect(await run.call('analysis.start')).toEqual({ ok: true, workJobId: null });
    const [restored] = run.repos.claims.list();
    expect(restored?.reviewStatus).toBe('normal');
    expect(restored?.revocationHold).toBeUndefined();
    expect(run.fake.prompts).toHaveLength(1);
  });

  it('檔案被刪除：事實項標來源已移除且不保存恢復依據', async () => {
    env = testDataDir({ 'README.md': A });
    const run = env.open(fakeEngine(byDoc));
    await authorize(run, { authorize: ['README.md'] });
    await run.call('analysis.start');
    await run.settled();
    env.files.delete('README.md');
    await run.call('analysis.start');
    const [claim] = run.repos.claims.list();
    expect(claim?.reviewStatus).toBe('source_removed');
    expect(claim?.revocationHold).toBeUndefined();
  });
});

describe('analysis：單元寫入不半套（R9）', () => {
  it('commitUnit 中途失敗：事實項、計數、已分析版本都不留下，工作改為已暫停', async () => {
    env = testDataDir({ 'README.md': `${A}\n\n完成搜尋功能。` });
    let saves = 0;
    const run = env.open(
      fakeEngine(() =>
        output([feature('登入功能', '完成登入功能。'), feature('搜尋功能', '完成搜尋功能。')]),
      ),
      (repos) => ({
        ...repos,
        claims: {
          ...repos.claims,
          save: (claim) => {
            saves += 1;
            if (saves === 2) throw new Error('寫入失敗');
            return repos.claims.save(claim);
          },
        },
      }),
    );
    await authorize(run, { authorize: ['README.md'] });
    await run.call('analysis.start');
    await run.settled();
    expect(saves).toBe(2);
    expect(run.repos.claims.list()).toEqual([]);
    expect(run.repos.analysisState.listAnalyzed()).toEqual([]);
    expect(run.repos.analysisState.listSummaries()).toEqual([]);
    expect(await status(run)).toMatchObject({
      state: 'paused',
      pauseReason: 'interrupted',
      completedUnits: 0,
      claimsAdded: 0,
    });
  });

  it('執行中再按一次：回同一個工作 id，不建第二個工作', async () => {
    env = testDataDir({ 'README.md': A });
    const run = env.open(fakeEngine(byDoc));
    await authorize(run, { authorize: ['README.md'] });
    const [one, two] = await Promise.all([run.call('analysis.start'), run.call('analysis.start')]);
    expect(two.workJobId).toBe(one.workJobId);
    await run.settled();
    expect(run.fake.prompts).toHaveLength(1);
  });
});
