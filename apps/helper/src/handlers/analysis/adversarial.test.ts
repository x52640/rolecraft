// P1-T060 對抗驗證屬實項的回歸測試：
// 1. 撤銷授權、移除資料夾當下就套 R2；檔案刪除後生成與草稿的來源關卡當來源已移除。
// 2. commitUnit 以交易內現況為底：分析期間被否決的事實項不復活、確認不被蓋掉。
// 一律假 provider、假資料夾，不呼叫真實 CLI。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isUsableForGeneration } from '@rolecraft/domain';
import { createLocalFileStore } from '@rolecraft/storage';
import { afterEach, describe, expect, it } from 'vitest';

import { createClaimsService } from '../claims/storage-service.ts';
import { createClaimGate } from '../sources/claim-gate.ts';
import {
  authorize,
  fakeEngine,
  feature,
  output,
  testDataDir,
  type FakeEngine,
  type HelperRun,
  type TestDataDir,
} from './__fixtures__/analysis-env.ts';

const A1 = '# 專案甲\n\n完成登入功能。';
const A2 = `${A1}\n\n登入功能已下架。`;

let env: TestDataDir;
const dirs: string[] = [];
afterEach(() => {
  env.cleanup();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function analyzed(fake: FakeEngine): Promise<HelperRun> {
  const run = env.open(fake);
  await authorize(run, { authorize: ['README.md'] });
  await run.call('analysis.start');
  await run.settled();
  return run;
}

describe('撤銷當下就套 R2（不等下次分析）', () => {
  it('取消勾選：事實項立即標來源已移除（含恢復依據）、文件標已撤銷，不呼叫模型', async () => {
    env = testDataDir({ 'README.md': A1 });
    const run = await analyzed(fakeEngine(() => output([feature('登入功能', '完成登入功能。')])));
    await authorize(run, { revoke: ['README.md'] });
    const [claim] = run.repos.claims.list();
    expect(claim?.reviewStatus).toBe('source_removed');
    expect(claim?.revocationHold?.previousStatus).toBe('normal');
    expect(claim && isUsableForGeneration(claim)).toBe(false);
    expect(run.repos.sourceDocuments.list()[0]?.authorizationStatus).toBe('revoked');
    expect(run.fake.prompts).toHaveLength(1);
  });

  it('移除資料夾：其下文件撤銷、事實項立即標來源已移除', async () => {
    env = testDataDir({ 'README.md': A1 });
    const run = await analyzed(fakeEngine(() => output([feature('登入功能', '完成登入功能。')])));
    const rootId = run.sources.listFolders?.()[0]?.rootId ?? '';
    expect(run.sources.removeFolder?.(rootId)).toBe(true);
    expect(run.repos.claims.list()[0]?.reviewStatus).toBe('source_removed');
    expect(run.repos.sourceDocuments.list()[0]?.authorizationStatus).toBe('revoked');
  });

  it('檔案被刪（尚未重新分析）：生成／草稿的來源關卡當來源已移除；使用者確認過的仍可用', async () => {
    env = testDataDir({ 'README.md': A1 });
    const run = await analyzed(fakeEngine(() => output([feature('登入功能', '完成登入功能。')])));
    const [claim] = run.repos.claims.list();
    if (!claim) throw new Error('沒有事實項');
    const confirmed = {
      ...claim,
      id: 'c-confirmed',
      basis: {
        ...claim.basis,
        userConfirmation: { confirmedAt: '2026-10-11T00:00:00.000Z', text: '登入功能' },
      },
    };
    const gate = createClaimGate(run.sources.registry);
    await gate.refresh();
    expect(gate.apply([claim])[0]?.reviewStatus).toBe('normal');

    env.files.delete('README.md');
    await gate.refresh();
    const [gated, gatedConfirmed] = gate.apply([claim, confirmed]);
    expect(gated?.reviewStatus).toBe('source_removed');
    expect(gated && isUsableForGeneration(gated)).toBe(false);
    expect(gatedConfirmed && isUsableForGeneration(gatedConfirmed)).toBe(true);
  });
});

/** 第二次分析送出後、寫入前停住，讓測試在中間做使用者操作。 */
function pausingEngine() {
  let release: () => void = () => undefined;
  let reached: () => void = () => undefined;
  const midway = new Promise<void>((resolve) => (reached = resolve));
  const fake = fakeEngine((prompt) =>
    prompt.includes('登入功能已下架')
      ? {
          text: JSON.stringify({
            claims: [
              feature('登入功能', '完成登入功能。'),
              feature('登入功能已下架', '登入功能已下架。', 'unknown'),
            ],
            conflicts: [{ claims: [0, 1], summary: '同文件矛盾' }],
            summary: '摘要',
          }),
        }
      : output([feature('登入功能', '完成登入功能。')]),
  );
  const select = fake.engine.select.bind(fake.engine);
  fake.engine.select = async () => {
    const selection = await select();
    if (!selection) return selection;
    return {
      ...selection,
      execute: async (request) => {
        const outcome = await selection.execute(request);
        if (request.prompt.includes('登入功能已下架')) {
          reached();
          await new Promise<void>((resolve) => (release = resolve));
        }
        return outcome;
      },
    };
  };
  return { fake, midway, release: () => release() };
}

describe('commitUnit 以現況為底', () => {
  function claimsService(run: HelperRun) {
    const dir = mkdtempSync(path.join(tmpdir(), 'rolecraft-files-'));
    dirs.push(dir);
    return createClaimsService({ db: run.db, fileStore: createLocalFileStore(dir) });
  }

  it('分析期間被否決的事實項不會被復活', async () => {
    env = testDataDir({ 'README.md': A1 });
    const gate = pausingEngine();
    const run = await analyzed(gate.fake);
    const [x] = run.repos.claims.list();
    if (!x) throw new Error('沒有事實項');
    env.files.set('README.md', A2);
    await run.call('analysis.start');
    await gate.midway;
    expect(await claimsService(run).reject(x.id)).toEqual({ ok: true });
    gate.release();
    await run.settled();
    expect(run.repos.claims.get(x.id)).toBeNull();
    expect(run.repos.claims.list().map((c) => c.text)).toEqual(['登入功能已下架']);
  });

  it('分析期間的使用者確認不被蓋掉，只套來源矛盾升級', async () => {
    env = testDataDir({ 'README.md': A1 });
    const gate = pausingEngine();
    const run = await analyzed(gate.fake);
    const [x] = run.repos.claims.list();
    if (!x) throw new Error('沒有事實項');
    env.files.set('README.md', A2);
    await run.call('analysis.start');
    await gate.midway;
    const confirmed = await claimsService(run).confirm({
      claimId: x.id,
      text: x.text,
      expectedReviewStatus: 'normal',
      completion: 'user_confirmed_done',
    });
    expect(confirmed).toEqual({ ok: true });
    gate.release();
    await run.settled();
    const after = run.repos.claims.get(x.id);
    expect(after?.basis.userConfirmation?.text).toBe(x.text);
    expect(after?.completionStatus).toBe('user_confirmed_done');
    expect(after?.reviewStatus).toBe('source_conflict');
  });
});

describe('文件改成只剩空白（codex review）', () => {
  it('清掉舊摘要，之後的分析不再帶入', async () => {
    env = testDataDir({ 'README.md': A1, 'plan.md': '# 計畫\n\n計畫中：匯出 PDF。' });
    const fake = fakeEngine((prompt) =>
      prompt.includes('計畫中：匯出 PDF')
        ? output([feature('匯出 PDF', '計畫中：匯出 PDF。', 'planned')], '計畫摘要')
        : output([feature('登入功能', '完成登入功能。')], '舊的甲摘要'),
    );
    const run = await analyzed(fake);
    expect(run.repos.analysisState.listSummaries().map((s) => s.text)).toEqual(['舊的甲摘要']);

    env.files.set('README.md', '   \n');
    await authorize(run, { authorize: ['plan.md'] });
    await run.call('analysis.start');
    await run.settled();
    expect(fake.prompts.at(-1)).toContain('計畫中：匯出 PDF');
    expect(fake.prompts.at(-1)).not.toContain('舊的甲摘要');
    expect(run.repos.analysisState.listSummaries().map((s) => s.text)).toEqual(['計畫摘要']);
  });
});
