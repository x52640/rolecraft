// D30 防退步（P1-T090）：Profile 各欄的出處原文只供編輯器顯示，不進投遞自介的提示、
// 也不算自介數字檢查的出處（resume-import「個人資料編輯（D30）」）。只加測試、不改 pipeline 原始碼。資料全為合成。
import type { Profile, ProfileFieldSource } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import {
  CLAIMS,
  budget,
  idSource,
  profile,
  snapshot,
} from '../generation/fixtures.test-helpers.ts';
import { profileTexts } from './check.ts';
import { prepareIntro } from './prepare.ts';

const MARK = '出處原文標記QX7';
const source = (text: string): ProfileFieldSource => ({
  kind: 'web',
  text: `${MARK} ${text} 帶領 45 人`,
  truncated: false,
  modified: false,
});

function profileWithSources(): Profile {
  const base = profile();
  return {
    ...base,
    version: 2,
    sources: {
      personalInfo: { 姓名: source('姓名：王小明') },
      experiences: base.experiences.map(() => ({
        company: source('甲公司'),
        title: source('前端工程師'),
        startDate: source('2021-03'),
        endDate: null,
        description: source('負責網站前端開發。'),
      })),
      skills: base.skills.map(() => source('TypeScript')),
    },
  };
}

describe('投遞自介不用 Profile 出處原文（D30）', () => {
  it('提示不含出處原文', () => {
    const result = prepareIntro(
      'job-1',
      { jobSnapshot: snapshot(), profile: profileWithSources(), claims: [...CLAIMS] },
      budget(200_000),
      idSource('p'),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).toContain('負責網站前端開發。');
    expect(result.prepared.prompt).not.toContain(MARK);
  });

  it('數字檢查的個人資料文字只有欄位值，沒有出處原文', () => {
    const texts = profileTexts(profileWithSources());
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.join('\n')).not.toContain(MARK);
    expect(texts.join('\n')).not.toContain('45');
  });
});
