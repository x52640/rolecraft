// 專案確認建立、事實項歸屬、重新分析自動歸入（P1-T063，D23）：暫存資料區＋假資料夾＋假 provider。
import type { Claim } from '@rolecraft/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  authorize,
  fakeEngine,
  feature,
  output,
  testDataDir,
  type HelperRun,
  type TestDataDir,
} from './__fixtures__/analysis-env.ts';
import {
  A,
  analyzedBoth,
  claimId,
  docId,
  FILES,
  projectsEngine,
} from './__fixtures__/projects-env.ts';

let env: TestDataDir;
afterEach(() => env.cleanup());

const INVALID = { ok: false, error: { code: 'invalid_request' } };

async function listed(run: HelperRun, projectId: string): Promise<string[]> {
  const res = await run.call('claims.list', { projectId });
  return (res.claims as Claim[]).map((c) => c.text);
}

async function unassigned(run: HelperRun): Promise<string[]> {
  const res = await run.call('claims.list_unassigned');
  return (res.claims as Claim[]).map((c) => c.text);
}

function projectIdOf(run: HelperRun, name: string): string {
  const project = run.repos.projectEvidence.list().find((p) => p.name === name);
  if (!project) throw new Error(`找不到專案 ${name}`);
  return project.id;
}

async function createBoth(run: HelperRun): Promise<void> {
  expect(
    await run.call('claims.create_projects', {
      projects: [
        { name: ' 甲專案 ', sourceDocumentIds: [docId(run, 'README.md')] },
        { name: '乙專案', sourceDocumentIds: [docId(run, 'notes.md')] },
      ],
    }),
  ).toEqual({ ok: true });
}

/** 一個引用兩份文件的事實項（跨專案）。 */
function saveCrossClaim(run: HelperRun): void {
  const [a, b] = run.repos.claims.list();
  if (!a || !b) throw new Error('需要兩項事實項');
  run.repos.claims.save({
    ...a,
    id: 'cross-claim',
    text: '跨文件',
    basis: { ...a.basis, sourceExcerpts: [...a.basis.sourceExcerpts, ...b.basis.sourceExcerpts] },
  });
}

describe('claims.create_projects：確認建立', () => {
  it('建立專案、事實項依文件歸入；跨專案的留在未歸專案；摘要為空字串', async () => {
    env = testDataDir(FILES);
    const run = env.open(projectsEngine());
    await analyzedBoth(run);
    saveCrossClaim(run);
    await createBoth(run);

    const projects = run.repos.projectEvidence.list();
    expect(projects.map((p) => [p.name, p.summary])).toEqual([
      ['甲專案', ''],
      ['乙專案', ''],
    ]);
    expect(await listed(run, projectIdOf(run, '甲專案'))).toEqual(['登入功能']);
    expect(await listed(run, projectIdOf(run, '乙專案'))).toEqual(['匯出 PDF']);
    expect(await unassigned(run)).toEqual(['跨文件']);
  });

  it('不合法的分組整批不建立：重複文件、已屬專案、已撤銷、不存在', async () => {
    env = testDataDir(FILES);
    const run = env.open(projectsEngine());
    await analyzedBoth(run);
    const readme = docId(run, 'README.md');
    const notes = docId(run, 'notes.md');
    const create = (projects: object[]) => run.call('claims.create_projects', { projects });

    expect(
      await create([
        { name: '甲', sourceDocumentIds: [readme] },
        { name: '乙', sourceDocumentIds: [readme, notes] },
      ]),
    ).toMatchObject(INVALID);
    expect(await create([{ name: '甲', sourceDocumentIds: ['no-such-doc'] }])).toMatchObject(
      INVALID,
    );
    expect(run.repos.projectEvidence.list()).toEqual([]);

    expect(await create([{ name: '甲', sourceDocumentIds: [readme] }])).toEqual({ ok: true });
    expect(await create([{ name: '乙', sourceDocumentIds: [notes, readme] }])).toMatchObject(
      INVALID,
    );
    expect(run.repos.projectEvidence.list().map((p) => p.name)).toEqual(['甲']);

    await authorize(run, { revoke: ['notes.md'] });
    expect(await create([{ name: '乙', sourceDocumentIds: [notes] }])).toMatchObject(INVALID);
    expect(run.repos.projectEvidence.list().map((p) => p.name)).toEqual(['甲']);
  });

  it('已在其他專案的事實項不搬動；移回未歸專案的也不會被新專案拉走', async () => {
    env = testDataDir(FILES);
    const run = env.open(projectsEngine());
    await analyzedBoth(run);
    expect(
      await run.call('claims.create_projects', {
        projects: [{ name: '甲', sourceDocumentIds: [docId(run, 'README.md')] }],
      }),
    ).toEqual({ ok: true });
    const pdf = claimId(run, '匯出 PDF');
    // 使用者把乙文件的事實項先移到甲
    expect(
      await run.call('claims.move_claim', { claimId: pdf, projectId: projectIdOf(run, '甲') }),
    ).toEqual({ ok: true });
    expect(
      await run.call('claims.create_projects', {
        projects: [{ name: '乙', sourceDocumentIds: [docId(run, 'notes.md')] }],
      }),
    ).toEqual({ ok: true });
    expect(await listed(run, projectIdOf(run, '甲'))).toEqual(['登入功能', '匯出 PDF']);
    expect(await listed(run, projectIdOf(run, '乙'))).toEqual([]);
  });
});

describe('專案整理：改名、合併、移動、刪除', () => {
  it('claims.list／list_unassigned 隨之正確', async () => {
    env = testDataDir(FILES);
    const run = env.open(projectsEngine());
    await analyzedBoth(run);
    await createBoth(run);
    const a = projectIdOf(run, '甲專案');
    const b = projectIdOf(run, '乙專案');

    expect(await run.call('claims.rename_project', { projectId: a, name: '新甲' })).toEqual({
      ok: true,
    });
    expect(run.repos.projectEvidence.get(a)?.name).toBe('新甲');

    // 移回未歸專案、再移到乙
    const login = claimId(run, '登入功能');
    expect(await run.call('claims.move_claim', { claimId: login, projectId: null })).toEqual({
      ok: true,
    });
    expect(await unassigned(run)).toEqual(['登入功能']);
    expect(await listed(run, a)).toEqual([]);
    expect(await run.call('claims.move_claim', { claimId: login, projectId: b })).toEqual({
      ok: true,
    });
    expect(await listed(run, b)).toEqual(['匯出 PDF', '登入功能']);
    expect(await unassigned(run)).toEqual([]);

    // 合併：乙併入甲（事實項與文件都過去），乙刪除
    expect(await run.call('claims.merge_projects', { projectId: b, intoProjectId: a })).toEqual({
      ok: true,
    });
    expect(run.repos.projectEvidence.get(b)).toBeNull();
    expect(await listed(run, a)).toEqual(['匯出 PDF', '登入功能']);
    expect(run.repos.projectDocuments.listByProject(a).sort()).toEqual(
      [docId(run, 'README.md'), docId(run, 'notes.md')].sort(),
    );
    expect(
      await run.call('claims.merge_projects', { projectId: a, intoProjectId: a }),
    ).toMatchObject(INVALID);

    // 刪除：事實項回到未歸專案、本身不刪，文件不再屬任何專案
    expect(await run.call('claims.delete_project', { projectId: a })).toEqual({ ok: true });
    expect(run.repos.projectEvidence.list()).toEqual([]);
    expect(await unassigned(run)).toEqual(['登入功能', '匯出 PDF']);
    expect(run.repos.projectDocuments.all().size).toBe(0);
    expect(await run.call('claims.delete_project', { projectId: a })).toMatchObject(INVALID);
    expect(
      await run.call('claims.move_claim', { claimId: login, projectId: 'missing' }),
    ).toMatchObject(INVALID);
  });
});

describe('重新分析自動歸入', () => {
  const A2 = `${A}\n\n完成搜尋功能。`;
  /** 第二次分析甲文件：既有的「登入功能」（去重丟掉）＋新的「搜尋功能」。 */
  const secondPass = () =>
    fakeEngine((prompt) =>
      prompt.includes('完成搜尋功能')
        ? output([feature('登入功能', '完成登入功能。'), feature('搜尋功能', '完成搜尋功能。')])
        : output([]),
    );

  async function prepared(): Promise<{ run: HelperRun; a: string }> {
    const run = env.open(projectsEngine());
    await analyzedBoth(run);
    await createBoth(run);
    const a = projectIdOf(run, '甲專案');
    // 使用者把既有事實項移回未歸專案
    const login = claimId(run, '登入功能');
    expect(await run.call('claims.move_claim', { claimId: login, projectId: null })).toEqual({
      ok: true,
    });
    env.files.set('README.md', A2);
    return { run, a };
  }

  it('新事實項歸入其文件所屬專案；既有手動搬過的不動', async () => {
    env = testDataDir(FILES);
    const { a } = await prepared();
    const run = env.open(secondPass());
    await run.call('analysis.start');
    await run.settled();
    expect(await listed(run, a)).toEqual(['搜尋功能']);
    expect(await unassigned(run)).toEqual(['登入功能']);
  });

  it('文件不屬任何專案時，新事實項留在未歸專案', async () => {
    env = testDataDir(FILES);
    const { a } = await prepared();
    expect(await env.open(secondPass()).call('claims.delete_project', { projectId: a })).toEqual({
      ok: true,
    });
    const run = env.open(secondPass());
    await run.call('analysis.start');
    await run.settled();
    expect(await unassigned(run)).toEqual(['登入功能', '搜尋功能']);
  });

  it('commitUnit 失敗整筆回滾：事實項與歸屬都不留下', async () => {
    env = testDataDir(FILES);
    const { a } = await prepared();
    const run = env.open(secondPass(), (repos) => ({
      ...repos,
      analysisState: {
        ...repos.analysisState,
        saveSummary: () => {
          throw new Error('寫入失敗');
        },
      },
    }));
    await run.call('analysis.start');
    await run.settled();
    expect(run.repos.claims.list().map((c) => c.text)).not.toContain('搜尋功能');
    expect(run.repos.projectEvidence.get(a)?.claimIds).toEqual([]);
    expect(await run.call('analysis.status')).toMatchObject({
      analysis: { state: 'paused', pauseReason: 'interrupted' },
    });
  });
});
