// P1-T069 對抗審查（2026-10-12，修正 cc63fdb）與 codex review cc63fdb 追加項的回歸測試：
// 個資標籤辨識退步、「至今」要日期起點、組合記號姓名。資料全為合成、去識別化；不呼叫任何模型。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { checkResumeParse } from './check.ts';
import { isStrictPersonalLabel } from './labels.ts';
import { prepareResumeParse } from './prepare.ts';
import { createRedactor } from './redact.ts';

function prepare(lines: string[]) {
  const result = prepareResumeParse(
    { pages: [{ pageNumber: 1, lines }], names: [], personalHints: [] },
    budget(1e6),
    idSource('a'),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

const LABELS = [
  '出生年月日',
  '居住地址',
  '微信號：',
  '緊急聯絡人',
  '個人網站',
  'LinkedIn Profile',
  'Residential Address',
  'Permanent Address',
  'Present Address',
  '通訊處：',
  '出生地',
  '身分證字號',
  '電子信箱',
  '公司電話',
  '身分證號',
  'Line帳號：',
  '地　　址：',
  'LineID',
  'FullName',
  '中文姓名：',
  '英文本名',
];

describe('對抗審查 1：個資標籤獨占一行，下一行的值不送模型', () => {
  it.each(LABELS)('「%s」與下一行的值都不送', (label) => {
    const { prompt, personalInfo } = prepare([label, '虛構值甲乙丙', '工作經驗', '範例內容']);
    expect(prompt).not.toContain('虛構值甲乙丙');
    expect(personalInfo.map((r) => r.value.value)).toContain('虛構值甲乙丙');
    expect(prompt).toContain('範例內容');
  });

  it('雙欄「姓名⇥出生年月日」／「王小明⇥1990/01/01」不送', () => {
    const { prompt } = prepare(['姓名\t出生年月日', '王小明\t1990/01/01', '工作經驗']);
    for (const s of ['王小明', '1990/01/01']) expect(prompt).not.toContain(s);
  });

  it('「Line帳號：」與下一行「abc123」不送', () => {
    const { prompt } = prepare(['Line帳號：', 'abc123', '工作經驗']);
    expect(prompt).not.toContain('abc123');
  });

  it('一般內容（職稱、工具、工作內容）與下一行照送', () => {
    const general = [
      'Mobile Developer',
      'GitHub Actions',
      '通訊軟體開發',
      'Mobile Developer：',
      'Product Line',
      'Company Name',
      '網站改版專案負責',
    ];
    for (const s of general) expect(isStrictPersonalLabel(s.replace(/：$/u, ''))).toBe(false);
    const lines = general.flatMap((s, i) => [s, `下一行內容${String(i)}`]);
    const { prompt } = prepare(lines);
    for (const s of lines) expect(prompt).toContain(s);
  });
});

function endCheck(line: string, end: string) {
  const prepared = prepare(['範例公司', line]);
  return checkResumeParse(
    {
      education: [],
      experiences: [
        {
          company: null,
          title: null,
          start: null,
          end: { value: end, lines: ['1-2'] },
          description: null,
        },
      ],
      skills: [],
      sections: [],
    },
    { lines: prepared.lines, tokens: prepared.tokens },
  );
}

describe('對抗審查 2：「至今」前面要緊接日期起點', () => {
  it.each([
    '客戶滿意度 98.5% — 至今仍維持',
    '使用 Python 3.10.12 ~ 至今',
    '帶領 12.5 人 - 至今',
    '負責 v10.2 模組 – 至今',
  ])('一般小數不算日期：「%s」', (line) => {
    const result = endCheck(line, '至今');
    expect(result.discarded).toEqual([{ field: '第 1 段經歷結束日期', reason: 'not_a_date' }]);
  });

  it.each([
    ['軟體工程師\t民國110年7月～至今', '至今'],
    ['後端工程師\t2021/07~至今', '至今'],
    ['Software Engineer\t01 2019–Present', 'Present'],
    ['工程師\t2019.07\t至今', '至今'],
  ])('日期起點緊接區間或前一欄：「%s」', (line, end) => {
    const result = endCheck(line, end);
    expect(result.discarded).toEqual([]);
    expect(result.experiences[0]).toMatchObject({ current: true, endDate: null });
  });
});

describe('對抗審查 3：姓名與內文只差組合記號也遮蔽', () => {
  it('名單 Amy、內文 Amý（y＋組合記號）', () => {
    const { redact, tokens } = createRedactor([{ value: 'Amy', name: true }]);
    expect(redact('Hi Amý!')).toBe('Hi 〔姓名〕!');
    expect(tokens.get('〔姓名〕')).toBe('Amý');
  });

  it('名單 Jose、內文分解式／組合式 José', () => {
    const { redact, tokens } = createRedactor([{ value: 'Jose', name: true }]);
    expect(redact('By José Sample.')).toBe('By 〔姓名〕 Sample.');
    expect(tokens.get('〔姓名〕')).toBe('José');
    expect(redact('By José.')).toBe('By 〔姓名2〕.');
  });
});
