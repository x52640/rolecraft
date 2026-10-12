// P1-T078 codex 複審 2 項＋通則（2026-10-12）：任何讓「本次頁面姓名已辨識」成立的路徑，姓名在後文段落都必須被遮蔽。
// 資料全為合成、去識別化；不呼叫真實 CLI。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { h, inputsOf, lv, p, tr, type BlockSpec } from './web-fixtures.test-helpers.ts';
import { splitWebBlocks } from './web-personal.ts';
import { blocks } from './web-fixtures.test-helpers.ts';
import { prepareWebResumeParse } from './web-prepare.ts';

const prepare = (specs: readonly BlockSpec[], pageNames: string[] = []) =>
  prepareWebResumeParse(inputsOf(specs, { pageNames }), budget(1_000_000), idSource());

const body = (name: string) => [h(2, '自傳'), p(`我是${name}，喜歡門市營運。`)];

describe('姓名確認路徑都要遮得到後文的姓名', () => {
  const cases: [string, BlockSpec[], string][] = [
    ['姓名', [lv('姓名', '林雨晴')], '林雨晴'],
    ['Name', [lv('Name', 'Ivy Lin')], 'Ivy Lin'],
    ['Full Name', [lv('Full Name', 'Ivy Lin')], 'Ivy Lin'],
    ['英文姓名', [lv('英文姓名', 'Ivy Lin')], 'Ivy Lin'],
    ['中文名', [lv('中文名', '林雨晴')], '林雨晴'],
    ['英文名', [lv('英文名', 'Ivy Lin')], 'Ivy Lin'],
    ['暱稱', [lv('暱稱', '晴晴子')], '晴晴子'],
    ['姓＋名', [lv('姓', '林'), lv('名', '晴')], '林晴'],
    ['姓氏＋名字', [lv('姓氏', '林'), lv('名字', '雨晴')], '林雨晴'],
    ['名＋姓（順序相反）', [lv('名', '晴'), lv('姓', '林')], '林晴'],
    ['First＋Last Name', [lv('First Name', 'Ivy'), lv('Last Name', 'Lin')], 'Ivy Lin'],
    ['Given＋Family Name', [lv('Given Name', 'Ivy'), lv('Family Name', 'Lin')], 'Ivy Lin'],
    ['Surname＋First Name', [lv('Surname', 'Lin'), lv('First Name', 'Ivy')], 'Ivy Lin'],
    ['段落「姓名：值」', [p('姓名：林雨晴')], '林雨晴'],
    ['表格列', [tr('姓名\t林雨晴')], '林雨晴'],
    ['4 格表格列', [tr('姓名\t林雨晴\t手機\t0900-000-000')], '林雨晴'],
    ['標籤獨占一塊', [p('姓名'), p('林雨晴')], '林雨晴'],
    ['內層標籤', [lv('其他', '姓名：林雨晴')], '林雨晴'],
    ['聯絡區內', [h(2, '聯絡方式'), p('姓名：林雨晴'), h(2, '經歷')], '林雨晴'],
  ];
  for (const [what, specs, name] of cases) {
    it(what, () => {
      const result = prepare([...specs, ...body(name)]);
      if (!result.ok) throw new Error(`${what}: ${result.reason}`);
      expect(result.prepared.prompt).not.toContain(name);
      expect(result.prepared.prompt).toContain('喜歡門市營運');
    });
  }

  it('姓名元素（pageNames）', () => {
    const result = prepare(body('林雨晴'), ['林雨晴']);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).not.toContain('林雨晴');
  });

  it('姓＋名的中間有空白也遮', () => {
    const result = prepare([lv('姓', '林'), lv('名', '晴'), p('我是 林 晴。'), p('Ivy 門市')]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).not.toMatch(/林\s*晴/u);
  });
});

describe('合併不出 2 字以上的姓名：不算已確認', () => {
  it('只有「姓：林」或「名：晴」、或「姓名：林」→ name_unconfirmed；標籤區塊仍不送', () => {
    for (const specs of [
      [lv('姓', '林')],
      [lv('名', '晴')],
      [lv('姓名', '林')],
      [lv('First Name', 'I')],
    ]) {
      expect(prepare([...specs, p('門市營運')])).toEqual({ ok: false, reason: 'name_unconfirmed' });
    }
    const confirmed = prepareWebResumeParse(
      inputsOf([lv('姓', '林'), p('門市營運')], { confirmedNames: ['林晴'] }),
      budget(1_000_000),
      idSource(),
    );
    if (!confirmed.ok) throw new Error(confirmed.reason);
    expect(confirmed.prepared.lines.map((l) => l.id)).toEqual(['b2']);
  });

  it('姓名元素或使用者確認的姓名只有 1 字也不算', () => {
    expect(prepare([p('門市營運')], ['林'])).toEqual({ ok: false, reason: 'name_unconfirmed' });
    const one = prepareWebResumeParse(
      inputsOf([p('門市營運')], { confirmedNames: ['林'] }),
      budget(1_000_000),
      idSource(),
    );
    expect(one).toEqual({ ok: false, reason: 'name_unconfirmed' });
  });

  it('內層標籤：預填用內層的值', () => {
    const result = prepare([lv('其他', '姓名：林雨晴'), p('門市營運')]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.personalInfo).toEqual([
      { label: '姓名', value: { value: '林雨晴', blockId: 'b1', containsPersonalData: false } },
    ]);
  });
});

describe('複審 2（2026-10-12）', () => {
  it('名字欄位沒有姓氏欄位：值與拆出的別名仍加入遮蔽', () => {
    const specs = [lv('名字', '雨晴／Rainy'), p('英文名 Rainy，大家叫我雨晴')];
    const result = prepare(specs, ['林雨晴']);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).not.toContain('Rainy');
    expect(result.prepared.prompt).not.toContain('雨晴');
  });

  it('只有姓氏欄位（2 字以上）也加入遮蔽，但門檻照舊', () => {
    const specs = [lv('Last Name', 'Linn'), p('Ms Linn 門市')];
    expect(prepare(specs)).toEqual({ ok: false, reason: 'name_unconfirmed' });
    const result = prepare(specs, ['林雨晴']);
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).not.toContain('Linn');
  });

  it('大量重複的姓／名欄位：先去重、組合數有上限', () => {
    const many = Array.from({ length: 1000 }, (_, i) => [
      lv('姓', i % 2 === 0 ? '林' : '王'),
      lv('名', '雨晴'),
    ]).flat();
    const split = splitWebBlocks(blocks(many));
    expect(split.labeledNames.length).toBeLessThanOrEqual(16);
    expect(split.labeledNames).toContain('林雨晴');
    const distinct = Array.from({ length: 1000 }, (_, i) => [
      lv('Last Name', `Fam${String(i)}`),
      lv('First Name', `Giv${String(i)}`),
    ]).flat();
    const big = splitWebBlocks(blocks(distinct));
    expect(big.labeledNames.length).toBeLessThan(5000);
  });
});
