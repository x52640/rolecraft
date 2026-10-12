// D30 防退步（P1-T090）：Profile 各欄的出處原文只供編輯器顯示，不進履歷生成的提示
// （resume-import「個人資料編輯（D30）」）。只加測試、不改 pipeline 原始碼。資料全為合成。
import type { Profile, ProfileFieldSource } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { CLAIMS, budget, idSource, profile, snapshot } from './fixtures.test-helpers.ts';
import { planGeneration, prepareGeneration } from './prepare.ts';

const MARK = '出處原文標記QX7';
const source = (text: string): ProfileFieldSource => ({
  kind: 'pdf',
  text: `${MARK} ${text}`,
  truncated: false,
  modified: true,
});

/** 每一欄都帶出處原文（含標記字樣）的 Profile。 */
function profileWithSources(): Profile {
  const base = profile();
  return {
    ...base,
    version: 5,
    sources: {
      personalInfo: { 姓名: source('姓名：王小明') },
      experiences: base.experiences.map(() => ({
        company: source('甲公司'),
        title: source('前端工程師'),
        startDate: source('2021-03'),
        endDate: source('至今'),
        description: source('負責網站前端開發。'),
      })),
      skills: base.skills.map(() => source('TypeScript')),
    },
  };
}

describe('生成提示不含 Profile 出處原文（D30）', () => {
  it('每一欄都有出處時，送出的提示仍沒有任何出處原文', () => {
    const planned = planGeneration({
      jobSnapshot: snapshot(),
      budget: budget(200_000),
      newId: idSource('p'),
    });
    if (!planned.ok) throw new Error(planned.reason);
    const prepared = prepareGeneration(
      planned.plan,
      { profile: profileWithSources(), jobSnapshot: snapshot(), claims: [...CLAIMS] },
      idSource('b'),
    );
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(prepared.prompt).toContain('負責網站前端開發。');
    expect(prepared.prompt).not.toContain(MARK);
  });
});
