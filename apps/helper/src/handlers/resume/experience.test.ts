// P1-T072：客製履歷逐段改寫工作經歷。假 Claude 子程序，不呼叫真實 CLI。
import type { ResumeSection } from '@rolecraft/contracts';
import { FALLBACK_RATIONALE } from '@rolecraft/pipeline';
import { afterEach, describe, expect, it } from 'vitest';

import { runWithResult, setupGeneration } from './__fixtures__/fake-claude.ts';
import { JOB, PROFILE, type ResumeDb } from './__fixtures__/resume-db.ts';

let t: ResumeDb | null = null;
afterEach(() => t?.cleanup());

const EXPERIENCES = [
  {
    company: '甲公司',
    title: '前端工程師',
    startDate: '2021-03',
    endDate: null,
    description: '負責網站前端開發，維護 12 個產品頁面。',
  },
  {
    company: '丙公司',
    title: '客戶成功經理',
    startDate: '2019-01',
    endDate: '2021-02',
    description: '負責企業客戶導入與續約。',
  },
];

/** 只改寫 E1（不引用事實項、數字來自經歷描述）＋一段專案；E2 沒有產出。 */
const ONLY_E1 = JSON.stringify({
  matches: [],
  gaps: [],
  sections: [
    {
      placement: 'E1',
      text: '維護 12 個產品頁面的前端開發',
      citations: [],
      rationale: '對應前端開發需求',
    },
    {
      placement: 'project',
      text: '開發登入功能',
      citations: [{ claim: 'C2', statedCompletion: 'in_progress' }],
      rationale: '補充專案經驗',
    },
  ],
});

describe('resume.generate 經歷段落（P1-T072）', () => {
  it('提示要求逐段改寫經歷；缺的經歷補沿用原文；經歷段數字可通過、只需逐段確認', async () => {
    const { fake, settled, db } = setupGeneration(runWithResult(ONLY_E1));
    t = db;
    db.repos.profiles.save({ ...PROFILE, experiences: EXPERIENCES });
    expect(await db.send({ op: 'resume.generate', payload: { jobSnapshotId: JOB } })).toMatchObject(
      { ok: true },
    );
    await settled;

    expect(fake.modelCalls()).toHaveLength(1);
    const [call] = fake.modelCalls();
    expect(call?.stdin).toContain('每一段既有經歷（E1、E2…）都要輸出');

    const [version] = db.repos.resumeVersions.listByJobSnapshot(JOB);
    const sections: ResumeSection[] = version?.sections ?? [];
    expect(sections.map((s) => [s.placement?.group, s.text])).toEqual([
      ['experience', '維護 12 個產品頁面的前端開發'],
      ['project', '開發登入功能'],
      ['experience', '負責企業客戶導入與續約。'],
    ]);
    const [rewrite, , filled] = sections;
    expect(filled).toMatchObject({
      origin: 'generated',
      decision: 'pending',
      citations: [],
      rationale: FALLBACK_RATIONALE,
      placement: { group: 'experience', company: '丙公司', title: '客戶成功經理' },
    });

    // 原文對照：兩段經歷都對到 Profile 描述
    const got = (await db.send({
      op: 'resume.get',
      payload: { resumeVersionId: version?.id },
    })) as { originals: { sectionId: string; text: string }[] };
    expect(got.originals).toEqual([
      { sectionId: rewrite?.id, text: EXPERIENCES[0]?.description },
      { sectionId: filled?.id, text: EXPERIENCES[1]?.description },
    ]);

    // 經歷段：數字 12 出自已確認的經歷描述，不報數字問題；沒有引用 → 可逐段確認
    const ref = { resumeVersionId: version?.id, sectionId: rewrite?.id };
    const check = (await db.send({
      op: 'resume.check_export',
      payload: { resumeVersionId: version?.id },
    })) as {
      issues: { sectionId: string; check: string; resolvableBySectionConfirmation: boolean }[];
    };
    const own = check.issues.filter((i) => i.sectionId === rewrite?.id);
    expect(own.map((i) => i.check)).toEqual(['no_citation']);
    expect(own.every((i) => i.resolvableBySectionConfirmation)).toBe(true);

    expect(await db.send({ op: 'resume.accept_section', payload: ref })).toMatchObject({
      ok: true,
    });
    expect(
      await db.send({ op: 'resume.confirm_section', payload: { ...ref, text: rewrite?.text } }),
    ).toMatchObject({ ok: true });
    const after = (await db.send({
      op: 'resume.check_export',
      payload: { resumeVersionId: version?.id },
    })) as { issues: { sectionId: string }[]; blockers: { sectionId: string }[] };
    expect([...after.issues, ...after.blockers].some((x) => x.sectionId === rewrite?.id)).toBe(
      false,
    );
  });
});
