// P1-T069 對抗驗證與 codex review 屬實項的回歸測試：個資遮蔽 8 項（直接檢查送給模型的提示字串）、
// 捏造檢查 4 項。資料全為合成、去識別化；不呼叫任何模型。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { checkResumeParse } from './check.ts';
import { prepareResumeParse } from './prepare.ts';
import type { PersonalHint, RawField, ResumeParseOutput } from './types.ts';

function prompt(lines: string[], hints: PersonalHint[] = [], names: string[] = []) {
  const result = prepareResumeParse(
    {
      pages: [{ pageNumber: 1, lines }],
      names: names.map((value) => ({ value, pageNumber: 1, lineIndex: 0 })),
      personalHints: hints,
    },
    budget(1e6),
    idSource('h'),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.prepared;
}

describe('個資遮蔽（對抗驗證／codex 屬實項）', () => {
  it('1. 標籤中間有全形／半形空白（姓　　名、地 址）：整行不送', () => {
    const { prompt: p, personalInfo } = prompt([
      '姓　　名：林測試',
      '地　　址：虛構市測試區範例路一段',
      '電 話：(02)2222-3333',
      '工作經驗',
    ]);
    for (const s of ['林測試', '虛構市測試區', '2222-3333']) expect(p).not.toContain(s);
    expect(personalInfo.map((r) => r.value.value)).toContain('虛構市測試區範例路一段');
  });

  it('2. 標籤與值分兩行、雙欄標籤列、無冒號的「LINE ID xxx」：值也不送', () => {
    const { prompt: p } = prompt([
      '通訊地址',
      '虛構市測試區範例路二段',
      'LINE ID test.line.id',
      'LINE ID',
      'linefriendabc',
      '姓名\t居住地',
      '林測試\t虛構市',
      '工作經驗',
    ]);
    for (const s of ['範例路二段', 'test.line.id', 'linefriendabc', '林測試', '虛構市']) {
      expect(p).not.toContain(s);
    }
    expect(p).toContain('工作經驗');
  });

  it('3. 英文標籤含關鍵字（Home／Mailing／Current Address、Contact Number、Personal Email）', () => {
    const { prompt: p } = prompt([
      'Home Address: 12 Sample Road, Testville',
      'Mailing Address: 34 Demo Street',
      'Current Address: 56 Mock Lane',
      'Contact Number: 55 66 77',
      'Personal Email: sample[at]example.org',
      'Company Name: Example Corp',
    ]);
    for (const s of ['Sample Road', 'Demo Street', 'Mock Lane', '55 66 77', 'sample[at]']) {
      expect(p).not.toContain(s);
    }
    expect(p).toContain('Example Corp');
  });

  it('4. 頁首英文名（由 helper 一併放進姓名清單）在內文也遮蔽', () => {
    const { prompt: p } = prompt(
      ['林測試 Alex Lin 熱愛解決問題', 'Alex Lin led the demo team.'],
      [],
      ['林測試', 'Alex Lin'],
    );
    expect(p).not.toContain('Alex Lin');
    expect(p).not.toContain('林測試');
    expect(p).toContain('led the demo team.');
  });

  it('5. 全形數字電話、全形 ＠、+886 (0)：先 NFKC 再比對', () => {
    const { prompt: p, tokens } = prompt([
      '歡迎來電 ０９１２－３４５－６７８',
      '或寄信 demo＠example．com',
      '國際 +886 (0)912-345-678',
    ]);
    for (const s of ['０９１２', 'demo＠', '+886', '912-345-678']) expect(p).not.toContain(s);
    // 佔位字對應原文片段（全形原樣），換回時一字不差
    expect([...tokens.values()]).toContain('０９１２－３４５－６７８');
  });

  it('6. 本機抽到「姓名⇥值」列（不在姓名清單）：內文的姓名也遮蔽', () => {
    const { prompt: p } = prompt(['姓名\t林測試', '自傳', '我是林測試，熱愛產品。']);
    expect(p).not.toContain('林測試');
    expect(p).toContain('熱愛產品');
  });

  it('7. 104 聯絡值換行超過兩行：依完整已知值消耗，續行全部不送', () => {
    const hint = { label: '通訊地址', value: '虛構市測試區範例路一段100號5樓之3（近測試站）' };
    const { prompt: p } = prompt(
      ['通訊地址\t虛構市測試區', '範例路一段', '100號5樓之3', '（近測試站）', '學歷', '示範大學'],
      [hint],
    );
    for (const s of ['範例路一段', '100號5樓之3', '近測試站']) expect(p).not.toContain(s);
    expect(p).toContain('示範大學');
  });

  it('8. 英文 Contact 區塊遇到 Employment History、Technical Skills 就停止', () => {
    const { prompt: p } = prompt([
      'Contact',
      '12 Sample Road',
      'Employment History',
      'Example Corp',
      'Contact Information',
      '34 Demo Street',
      'Technical Skills',
      'SQL',
    ]);
    expect(p).not.toContain('Sample Road');
    expect(p).not.toContain('Demo Street');
    for (const s of ['Employment History', 'Example Corp', 'Technical Skills', 'SQL']) {
      expect(p).toContain(s);
    }
  });
});

const f = (value: string, ...lines: string[]): RawField => ({ value, lines });

function check(lines: string[], output: Partial<ResumeParseOutput>) {
  const prepared = prompt(lines);
  return checkResumeParse(
    { education: [], experiences: [], skills: [], sections: [], ...output },
    { lines: prepared.lines, tokens: prepared.tokens },
  );
}

const experience = (patch: object) => ({
  company: null,
  title: null,
  start: null,
  end: null,
  description: null,
  ...patch,
});

describe('捏造檢查（對抗驗證屬實項）', () => {
  const LINES = [
    '資深工程師 2019/03 – 2021/06', // 1-1
    '2019 年起目前負責付款系統，I now lead the team.', // 1-2
    '• 規劃訂閱產品路線圖：協調設計與工程團隊，', // 1-3
    '縮短上線時程。', // 1-4
    '範例科技（電腦軟體服務業 30~100人）', // 1-5
    '熟悉 Google Cloud 與 Golang', // 1-6
    '後端工程師\t2021/07~至今', // 1-7
  ];

  it('1. 「至今」只能取自區間分隔符後或獨占一欄，且引用行要有年份', () => {
    const result = check(LINES, {
      experiences: [
        experience({ start: f('2019/03', '1-1'), end: f('目前', '1-2') }),
        experience({ start: f('2019/03', '1-1'), end: f('now', '1-2') }),
        experience({ start: f('2021/07', '1-7'), end: f('至今', '1-7') }),
      ],
    });
    expect(result.discarded).toEqual([
      { field: '第 1 段經歷結束日期', reason: 'not_a_date' },
      { field: '第 2 段經歷結束日期', reason: 'not_a_date' },
    ]);
    expect(result.experiences[2]).toMatchObject({ current: true, endDate: null });
  });

  it('2. 描述以行為單位：截兩行頭尾拼句不收；整行（含續行、去掉 •）可收', () => {
    const result = check(LINES, {
      experiences: [
        experience({ description: f('規劃訂閱產品路線圖縮短上線時程。', '1-3', '1-4') }),
        experience({ description: f('協調設計與工程團隊，縮短上線時程。', '1-3', '1-4') }),
        experience({
          description: f('規劃訂閱產品路線圖：協調設計與工程團隊，縮短上線時程。', '1-3', '1-4'),
        }),
      ],
    });
    expect(result.discarded).toEqual([
      { field: '第 1 段經歷描述', reason: 'not_in_source' },
      { field: '第 2 段經歷描述', reason: 'not_in_source' },
    ]);
    expect(result.experiences).toHaveLength(1);
  });

  it('3. 英數短值要合詞界：「Go」不能取自「Google」／「Golang」', () => {
    const result = check(LINES, { skills: [f('Go', '1-6'), f('Google Cloud', '1-6')] });
    expect(result.discarded).toEqual([{ field: '第 1 項技能', reason: 'not_in_source' }]);
    expect(result.skills.map((s) => s.value)).toEqual(['Google Cloud']);
  });

  it('4. 日期要年份或年月格式：「100人」不能當開始日期', () => {
    const result = check(LINES, {
      experiences: [
        experience({ company: f('範例科技', '1-5'), start: f('100', '1-5') }),
        experience({ start: f('2019/03', '1-1'), end: f('2021/06', '1-1') }),
      ],
    });
    expect(result.discarded).toEqual([{ field: '第 1 段經歷開始日期', reason: 'not_a_date' }]);
    expect(result.experiences[1]).toMatchObject({ endDate: { value: '2021/06' } });
  });
});
