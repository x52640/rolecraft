// P1-T069 codex 複審（2026-10-12，修正 d069fcd）3 項的回歸測試：括號修飾標籤、重疊遮蔽合併、日期分隔空白。
// 資料全為合成、去識別化；不呼叫任何模型。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { checkResumeParse } from './check.ts';
import { isPersonalLabel, isStrictPersonalLabel } from './labels.ts';
import { prepareResumeParse } from './prepare.ts';
import { createRedactor, unredact } from './redact.ts';

function prepare(lines: string[], names: string[] = []) {
  const result = prepareResumeParse(
    {
      pages: [{ pageNumber: 1, lines }],
      names: names.map((value) => ({ value, pageNumber: 1, lineIndex: 0 })),
      personalHints: [],
    },
    budget(1e6),
    idSource('c'),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

describe('codex 複審 1：中文標籤後接括號修飾也認得', () => {
  it.each([
    '地址（戶籍）',
    '住址(住家)',
    '電話（公司）',
    '地址（戶籍）：',
    '住址(住家):',
    '電話（公司）：',
    '通訊地址（戶籍地址）',
    'Address (Household Registration)',
  ])('「%s」獨占一行：下一行的值不送', (label) => {
    const { prompt, personalInfo } = prepare([label, '虛構值甲乙丙', '工作經驗', '範例內容']);
    expect(prompt).not.toContain('虛構值甲乙丙');
    expect(personalInfo.map((r) => r.value.value)).toContain('虛構值甲乙丙');
    expect(prompt).toContain('範例內容');
  });

  it('「通訊地址（戶籍地址）：值」同一行也移除', () => {
    expect(isPersonalLabel('通訊地址（戶籍地址）')).toBe(true);
    const { prompt } = prepare(['通訊地址（戶籍地址）：虛構市虛構路1號', '工作經驗']);
    expect(prompt).not.toContain('虛構市虛構路');
  });

  it('一般內容（含括號）照送：通訊軟體開發、Mobile Developer、GitHub Actions', () => {
    const general = [
      '通訊軟體開發',
      '通訊軟體開發（即時訊息）',
      'Mobile Developer',
      'Mobile Developer (iOS)',
      'GitHub Actions',
      'GitHub Actions（CI）',
    ];
    for (const s of general) expect(isStrictPersonalLabel(s)).toBe(false);
    const lines = general.flatMap((s, i) => [s, `下一行內容${String(i)}`]);
    const { prompt } = prepare(lines);
    for (const s of lines) expect(prompt).toContain(s);
  });
});

describe('codex 複審 2：重疊的敏感範圍合併成一段遮蔽', () => {
  it('姓名先比對到也不擋 email：Jose.Sample@example.org 整段遮掉，換回一字不差', () => {
    const { redact, tokens } = createRedactor([{ value: 'Jose', name: true }]);
    const original = '寄到 Jose.Sample@example.org 聯絡';
    const out = redact(original);
    expect(out).not.toMatch(/Sample|example/u);
    expect(unredact(out, tokens)).toBe(original);
  });

  it('經由 prepare：抽到的姓名與 email 重疊時提示不含 email 任何部分', () => {
    const line = 'Contact Jose.Sample@example.org for the demo.';
    const { prompt, lines } = prepare([line], ['Jose']);
    expect(prompt).not.toMatch(/Sample@|example\.org/u);
    expect(prompt).toContain('for the demo.');
    expect(lines[0]?.original).toBe(line);
  });

  it('兩個已知值部分重疊也合併：換回與原文一字不差', () => {
    const { redact, tokens } = createRedactor([
      { value: '王小明', name: true },
      { value: '小明路88號', name: false },
    ]);
    const original = '住在王小明路88號附近';
    const out = redact(original);
    expect(out).not.toMatch(/小明|88/u);
    expect(unredact(out, tokens)).toBe(original);
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

describe('codex 複審 3：日期起點內的分隔符前後可有空白', () => {
  it.each([
    '工程師\t2021 / 07 - 至今',
    '工程師\t2021 . 07 ~ 至今',
    '工程師\t07 / 2021 – 至今',
    '工程師\t民國 110 / 07 ～ 至今',
  ])('「%s」：current 為 true', (line) => {
    const result = endCheck(line, '至今');
    expect(result.discarded).toEqual([]);
    expect(result.experiences[0]).toMatchObject({ current: true, endDate: null });
  });

  it.each([
    '客戶滿意度 98.5% — 至今仍維持',
    '使用 Python 3.10.12 ~ 至今',
    '負責 v10.2 – 至今',
    '負責 v10 . 2 – 至今',
    '使用 Python 3 . 10 . 12 ~ 至今',
  ])('小數、版本號仍不算：「%s」', (line) => {
    const result = endCheck(line, '至今');
    expect(result.discarded).toEqual([{ field: '第 1 段經歷結束日期', reason: 'not_a_date' }]);
  });
});
