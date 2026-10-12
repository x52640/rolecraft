// P1-T069 codex 審查（2026-10-12）3 項的回歸測試：組合字姓名遮蔽、單行標籤誤刪、民國年「至今」。
// 資料全為合成、去識別化；不呼叫任何模型。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { checkResumeParse } from './check.ts';
import { prepareResumeParse } from './prepare.ts';
import { createRedactor } from './redact.ts';

function prepare(lines: string[], names: string[] = []) {
  const result = prepareResumeParse(
    {
      pages: [{ pageNumber: 1, lines }],
      names: names.map((value) => ({ value, pageNumber: 1, lineIndex: 0 })),
      personalHints: [],
    },
    budget(1e6),
    idSource('r'),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

describe('codex 審查 1：分解式重音的姓名也遮蔽，位置對應原文', () => {
  const decomposed = 'José Sample';

  it('姓名清單與內文都是分解式：不送原文，佔位字換回與原文一字不差', () => {
    const { prompt, tokens } = prepare([`${decomposed} led the demo team.`], [decomposed]);
    expect(prompt).not.toContain('José');
    expect(prompt).not.toContain('José');
    expect(prompt).toContain('led the demo team.');
    expect([...tokens.values()]).toContain(decomposed);
  });

  it('姓名清單是組合字、內文是分解式（反之亦然）：都遮蔽，前後文字原樣保留', () => {
    const { redact, tokens } = createRedactor([{ value: 'José Sample', name: true }]);
    expect(redact(`Hi ${decomposed}!`)).toBe('Hi 〔姓名〕!');
    expect(tokens.get('〔姓名〕')).toBe(decomposed);
    const other = createRedactor([{ value: decomposed, name: true }]);
    expect(other.redact('By José Sample.')).toBe('By 〔姓名〕.');
  });
});

describe('codex 審查 2：單獨一行只認嚴格的個資標籤', () => {
  it('「Mobile Developer」「GitHub Actions」「通訊軟體開發」（含結尾冒號）與下一行照送', () => {
    const lines = [
      'Mobile Developer',
      'Example Corp',
      'GitHub Actions',
      'Terraform',
      '通訊軟體開發',
      '即時訊息平台',
      'Mobile Developer：',
      'Sample Mobile Inc.',
    ];
    const { prompt } = prepare(lines);
    for (const s of lines) expect(prompt).toContain(s);
  });

  it('真正的標籤獨占一行仍移除下一行（Mobile Phone、E-mail Address、聯絡電話、LINE ID）', () => {
    const { prompt, personalInfo } = prepare([
      'Mobile Phone',
      '55 66 77 88',
      'E-mail Address',
      'demo[at]example.org',
      '聯絡電話',
      '22 33 44',
      'LINE ID',
      'friendabc',
      '工作經驗',
    ]);
    for (const s of ['55 66 77 88', 'demo[at]', '22 33 44', 'friendabc']) {
      expect(prompt).not.toContain(s);
    }
    expect(personalInfo).toHaveLength(4);
  });
});

describe('codex 審查 3：民國年區間的「至今」', () => {
  it('「民國110年7月～至今」：current 為 true', () => {
    const prepared = prepare(['軟體工程師\t民國110年7月～至今']);
    const result = checkResumeParse(
      {
        education: [],
        experiences: [
          {
            company: null,
            title: { value: '軟體工程師', lines: ['1-1'] },
            start: { value: '民國110年7月', lines: ['1-1'] },
            end: { value: '至今', lines: ['1-1'] },
            description: null,
          },
        ],
        skills: [],
        sections: [],
      },
      { lines: prepared.lines, tokens: prepared.tokens },
    );
    expect(result.discarded).toEqual([]);
    expect(result.experiences[0]).toMatchObject({ current: true, endDate: null });
  });
});
