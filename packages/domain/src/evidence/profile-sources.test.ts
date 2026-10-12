// D30 防退步（P1-T090）：Profile 各欄的出處原文不是個人資料欄位值，R1 檢查 3 不認出處原文裡的數字
// （evidence-model R1 檢查 3〔D30〕）。只加測試、不改 domain 原始碼。資料全為合成。
import { Profile, type ProfileFieldSource } from '@rolecraft/contracts';
import { describe, expect, it } from 'vitest';

import { checkExportReadiness } from './export-check.ts';
import { generated, metric, profile } from './fixtures.test-helpers.ts';

const source = (text: string): ProfileFieldSource => ({
  kind: 'web',
  text,
  truncated: false,
  modified: false,
});

const claims = [metric('m1', '回應時間降低 30%')];
const cite = [{ claimId: 'm1' }];

/** 出處原文帶著段落裡的數字；欄位值本身沒有。 */
const withSources = profile({
  personalInfo: { 姓名: '王小明' },
  skills: ['Go'],
  sources: {
    personalInfo: { 姓名: source('姓名：王小明 帶領 45 人團隊 營收成長 87% 2017 年') },
    experiences: [
      {
        company: source('ACME 帶領 45 人團隊'),
        title: null,
        startDate: null,
        endDate: null,
        description: source('營收成長 87%，2017 年上線'),
      },
    ],
    skills: [source('Go 87% 45 人')],
  },
});

describe('R1 檢查 3 不認 Profile 出處原文裡的數字（D30）', () => {
  it('測試用的 Profile（含出處）本身合法：不是因為 Profile 不合法才擋', () => {
    expect(Profile.safeParse(withSources).success).toBe(true);
    const r = checkExportReadiness({
      sections: [generated('2019 年加入 ACME', cite)], // 2019 出自欄位值：Profile 有被採用
      claims,
      profile: withSources,
    });
    expect(r.ok).toBe(true);
  });

  it.each(['帶領 45 人團隊', '營收成長 87%', '2017 年上線'])(
    '數字只出現在出處原文：%s → 擋',
    (text) => {
      const r = checkExportReadiness({
        sections: [generated(text, cite)],
        claims,
        profile: withSources,
      });
      expect(r.ok).toBe(false);
      expect(r.issues.map((i) => i.code)).toContain('number_unsourced');
    },
  );

  it('同樣的數字在欄位值裡就算出處（對照組）', () => {
    const r = checkExportReadiness({
      sections: [generated('帶領 45 人團隊', cite)],
      claims,
      profile: profile({ skills: ['帶領 45 人團隊'] }),
    });
    expect(r.ok).toBe(true);
  });
});
