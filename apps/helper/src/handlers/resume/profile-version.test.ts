// 履歷版本記下產生時的 Profile 版本號（D30 (a)，P1-T090；resume-output「Profile 修改後的過期提示（D30 (a)）」）。
// 驗：產生後記到當時版本號；生成途中（兩次送出之間）Profile 被 profile.update 改過，記的是最後一次送出讀到的值；
// 最後一次送出之後才改，不在存檔時重讀；Profile 沒有版本號記 0；段落編輯、接受不改；舊版本（沒有該欄）照常可讀。
// 假 provider（createFakeAdapter＋runWithSubscriptionCheck），不呼叫真實 CLI；資料全為合成。
import type { Profile, ProfileUpdatePayload } from '@rolecraft/contracts';
import { createFakeAdapter, runWithSubscriptionCheck } from '@rolecraft/providers';
import { afterEach, describe, expect, it } from 'vitest';

import { createProfileService } from '../profile/profile-service.ts';
import { BUDGET } from './__fixtures__/fake-claude.ts';
import { JOB, PROFILE, V, openResumeDb, version, type ResumeDb } from './__fixtures__/resume-db.ts';
import type { GenerationEngine } from './generation.ts';

const GOOD = JSON.stringify({
  matches: [{ requirement: '前端開發', claims: ['C2'] }],
  gaps: [],
  sections: [
    {
      placement: 'E1',
      text: '開發登入功能',
      citations: [{ claim: 'C2', statedCompletion: 'in_progress' }],
      rationale: '對應前端開發需求',
    },
  ],
});

let t: ResumeDb | null = null;
afterEach(() => t?.cleanup());

/** 每次送出依序回 replies；beforeReply(n) 在第 n 次送出（從 1 起）回覆前執行（模擬別處的寫入）。 */
function setup(
  replies: string[],
  beforeReply: (n: number, db: ResumeDb) => void = () => undefined,
) {
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => (settle = resolve));
  let sends = 0;
  const engine: GenerationEngine = {
    select: () =>
      Promise.resolve({
        provider: 'claude',
        model: 'fake-model',
        budget: BUDGET,
        execute: ({ prompt, signal }) => {
          sends += 1;
          beforeReply(sends, db);
          const text = replies[Math.min(sends, replies.length) - 1] ?? GOOD;
          const adapter = createFakeAdapter({ script: [{ text }] });
          return runWithSubscriptionCheck(
            adapter,
            { model: 'fake-model', prompt, trigger: 'run_start', signal },
            {
              parentEnv: { PATH: '/usr/bin' },
              now: () => new Date(0),
              newId: () => `rc-${String(sends)}`,
            },
          );
        },
      }),
    sleep: () => Promise.resolve(),
  };
  const db = openResumeDb({ withVersion: false, generation: engine, onGenerationSettled: settle });
  t = db;
  return { db, settled, sends: () => sends };
}

/** 經 profile.update 的同一個服務改 Profile（模擬個人資料頁儲存）。 */
function editProfile(db: ResumeDb) {
  const current = db.repos.profiles.list()[0] as Profile;
  const payload: ProfileUpdatePayload = {
    baseVersion: current.version ?? 0,
    personalInfo: Object.entries(current.personalInfo).map(([label, value]) => ({
      label,
      value,
      from: label,
    })),
    experiences: current.experiences.map((e, i) => ({ ...e, from: i })),
    skills: [
      ...current.skills.map((value, i) => ({ value, from: i })),
      { value: 'Go', from: null },
    ],
  };
  const outcome = createProfileService(db.repos.profiles).update?.(payload);
  expect(outcome?.ok).toBe(true);
}

async function generate(db: ResumeDb, settled: Promise<void>) {
  expect(await db.send({ op: 'resume.generate', payload: { jobSnapshotId: JOB } })).toMatchObject({
    ok: true,
  });
  await settled;
  const versions = db.repos.resumeVersions.listByJobSnapshot(JOB);
  expect(db.repos.workJobs.list().map((j) => [j.status, j.pauseReason])).toEqual([
    ['completed', null],
  ]);
  expect(versions).toHaveLength(1);
  return versions[0];
}

describe('ResumeVersion.profileVersion（D30 (a)）', () => {
  it('產生後記到當時的 Profile 版本號；resume.get／resume.list 照實帶出', async () => {
    const { db, settled } = setup([GOOD]);
    db.repos.profiles.save({ ...PROFILE, version: 7 });
    const saved = await generate(db, settled);
    expect(saved?.profileVersion).toBe(7);
    const got = await db.send({ op: 'resume.get', payload: { resumeVersionId: saved?.id } });
    expect(got).toMatchObject({ ok: true, version: { profileVersion: 7 } });
    const list = await db.send({ op: 'resume.list', payload: { jobSnapshotId: JOB } });
    expect(list).toEqual({
      ok: true,
      versions: [{ resumeVersionId: saved?.id, createdAt: saved?.createdAt, profileVersion: 7 }],
    });
  });

  it('生成途中（兩次送出之間）Profile 被 profile.update 改過：記最後一次送出讀到的版本號', async () => {
    // 第 1 次送出回不合格的輸出（會重試）；回覆前別處把 Profile 改成版本 1
    const { db, settled, sends } = setup(['不是 JSON', GOOD], (n, env) => {
      if (n === 1) editProfile(env);
    });
    const saved = await generate(db, settled);
    expect(sends()).toBe(2);
    expect(saved?.profileVersion).toBe(1);
  });

  it('最後一次送出之後才被改：記的仍是送出時讀到的值（存檔時不重讀）', async () => {
    const { db, settled } = setup([GOOD], (n, env) => {
      if (n === 1) editProfile(env);
    });
    const saved = await generate(db, settled);
    expect(saved?.profileVersion).toBe(0);
    expect(db.repos.profiles.list()[0]?.version).toBe(1);
  });

  it('Profile 沒有版本號（舊資料）記 0', async () => {
    const { db, settled } = setup([GOOD]);
    expect(db.repos.profiles.list()[0]?.version).toBeUndefined();
    expect((await generate(db, settled))?.profileVersion).toBe(0);
  });

  it('段落編輯、接受不改 profileVersion', async () => {
    const { db, settled } = setup([GOOD]);
    db.repos.profiles.save({ ...PROFILE, version: 4 });
    const saved = await generate(db, settled);
    const sectionId = saved?.sections[0]?.id;
    const resumeVersionId = saved?.id;
    await db.send({
      op: 'resume.edit_section',
      payload: {
        resumeVersionId,
        sectionId,
        text: '開發登入功能（改寫）',
        citations: [{ claimId: 'c-doc', statedCompletion: 'in_progress' }],
      },
    });
    await db.send({ op: 'resume.accept_section', payload: { resumeVersionId, sectionId } });
    const after = db.repos.resumeVersions.get(resumeVersionId ?? '');
    expect(after?.sections[0]?.text).toBe('開發登入功能（改寫）');
    expect(after?.profileVersion).toBe(4);
  });

  it('舊版本（沒有 profileVersion）照常可讀', async () => {
    const { db } = setup([GOOD]);
    db.repos.resumeVersions.save(version());
    const got = (await db.send({ op: 'resume.get', payload: { resumeVersionId: V } })) as {
      ok: boolean;
      version: Record<string, unknown>;
    };
    expect(got.ok).toBe(true);
    expect(got.version).not.toHaveProperty('profileVersion');
    const list = (await db.send({ op: 'resume.list', payload: { jobSnapshotId: JOB } })) as {
      versions: Record<string, unknown>[];
    };
    expect(list.versions).toHaveLength(1);
    expect(list.versions[0]).not.toHaveProperty('profileVersion');
  });
});
