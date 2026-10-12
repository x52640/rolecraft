// P1-T078 對抗審查＋codex review 6 項的回歸測試（2026-10-12）。資料全為合成、去識別化；不呼叫真實 CLI。
// 區塊結構仿 104 履歷編輯頁 fixture（apps/extension/src/sites/104/fixtures/resume-edit.html）。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { isNameLabel, isPersonalLabel } from './labels.ts';
import { prepareResumeParse } from './prepare.ts';
import { runWebResumeParse } from './run.ts';
import type { ResumeParseOutput } from './types.ts';
import { f, fakeDeps, h, inputsOf, lv, p, prepareWeb, tr } from './web-fixtures.test-helpers.ts';
import { prepareWebResumeParse } from './web-prepare.ts';
import { checkResumeParse } from './check.ts';

const EMPTY: ResumeParseOutput = { education: [], experiences: [], skills: [], sections: [] };
const confirmed = { confirmedNames: ['林雨晴'] };

describe('1. 英文別名後接標點', () => {
  it('「林雨晴 Ivy Lin，高雄人」「Ivy Lin, from…」的 Lin 也遮蔽', () => {
    const specs = [
      p('林雨晴 Ivy Lin，高雄人。第一份打工在麵包店。'),
      p('Ivy Lin, from Kaohsiung. My first job was at a bakery.'),
      p('林雨晴 Ivy Lin.'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, { pageNames: ['林雨晴'] }));
    expect(prompt).not.toContain('Lin');
    expect(prompt).not.toContain('Ivy');
    expect(prompt).toContain('from Kaohsiung');
  });
});

describe('2. 被移除的個資區塊不能讓兩邊的值拼起來', () => {
  it('網頁：「門市」＋（移除的手機）＋「經理」拼成「門市經理」→ lines_not_consecutive', async () => {
    const input = prepareWeb(
      inputsOf([p('門市'), lv('手機', '0900-000-000'), p('經理')], confirmed),
    );
    const { deps } = fakeDeps({
      text: JSON.stringify({ ...EMPTY, skills: [f('門市經理', 'b1', 'b3')] }),
    });
    const result = await runWebResumeParse(input, deps);
    if (!result.ok) throw new Error(result.failure);
    expect(result.draft.skills).toEqual([]);
    expect(result.draft.discarded).toEqual([
      { field: '第 1 項技能', reason: 'lines_not_consecutive' },
    ]);
  });

  it('PDF：移除的個資行同樣不佔位；空白行與換頁照舊算連續', () => {
    const prepared = prepareResumeParse(
      {
        pages: [
          { pageNumber: 1, lines: ['門市', '手機：0900-000-000', '經理', '', '資深', '產品'] },
          { pageNumber: 2, lines: ['經理人'] },
        ],
        names: [],
        personalHints: [],
      },
      budget(1_000_000),
      idSource(),
    );
    if (!prepared.ok) throw new Error(prepared.reason);
    const ctx = { lines: prepared.prepared.lines, tokens: prepared.prepared.tokens };
    const out = checkResumeParse(
      {
        ...EMPTY,
        skills: [
          f('門市經理', '1-1', '1-3'),
          f('經理資深', '1-3', '1-5'),
          f('產品經理人', '1-6', '2-1'),
        ],
      },
      ctx,
    );
    expect(out.skills.map((s) => s.value)).toEqual(['經理資深', '產品經理人']);
    expect(out.discarded).toEqual([{ field: '第 1 項技能', reason: 'lines_not_consecutive' }]);
  });
});

describe('3. 其他標籤寫法與姓名寫法', () => {
  it('英文名、中文名、暱稱、現居地、戶籍、居住城市、Born、年次的值都不送', () => {
    const specs = [
      lv('英文名', 'Rainy'),
      lv('中文名', '林小晴'),
      lv('暱稱', '晴晴子'),
      lv('現居地', '虛構市甲區'),
      lv('戶籍', '虛構縣乙鄉'),
      p('居住城市'),
      p('虛構市丙區'),
      lv('Born', '1990/01/02'),
      lv('年次', '七十九年次'),
      p('門市營運'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, confirmed));
    for (const secret of [
      'Rainy',
      '林小晴',
      '晴晴子',
      '虛構市甲區',
      '虛構縣乙鄉',
      '虛構市丙區',
      '1990/01/02',
      '七十九年次',
    ]) {
      expect(prompt).not.toContain(secret);
    }
    expect(prompt).toContain('門市營運');
  });

  it('標籤沒認出、值裡有「LINE:」「LINE ID」；長中文標籤；4 格表格列', () => {
    const specs = [
      lv('社群', 'LINE: ivy_line_01'),
      lv('其他', 'LINE ID ivy_line_02'),
      lv('緊急聯絡人姓名與電話', '林大明 虛構分機一二三'),
      tr('部門\t門市\tWeChat\tivy_wechat_03'),
      tr('職稱\t主任\t年資\t五年'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, confirmed));
    for (const secret of [
      'ivy_line_01',
      'ivy_line_02',
      '林大明',
      '虛構分機一二三',
      'ivy_wechat_03',
    ]) {
      expect(prompt).not.toContain(secret);
    }
    expect(prompt).toContain('職稱\t主任\t年資\t五年');
  });

  it('姓名值「林雨晴／Ivy Lin」拆開各自遮；字間有空白的「林 雨 晴」也遮', () => {
    const specs = [lv('姓名', '林雨晴／Ivy Lin'), p('我是 林 雨 晴，大家叫我 Ivy Lin 或林雨晴')];
    const { prompt } = prepareWeb(inputsOf(specs));
    for (const secret of ['林 雨 晴', '雨', 'Ivy', 'Lin']) expect(prompt).not.toContain(secret);
  });

  it('中英並列聯絡標題「聯絡方式 Contact」也開聯絡區', () => {
    const specs = [
      h(2, '聯絡方式 Contact'),
      p('虛構市丁區某路'),
      p('虛構帳號 ivy_handle'),
      h(2, '技能'),
      p('POS'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, confirmed));
    expect(prompt).not.toContain('虛構市丁區某路');
    expect(prompt).not.toContain('ivy_handle');
    expect(prompt).toContain('POS');
  });
});

describe('4. 聯絡標題含換行', () => {
  it('<h2>聯絡方式<br>地址</h2> 的續行標題不結束聯絡區', () => {
    const specs = [
      h(2, '聯絡方式'),
      { ...h(2, '虛構市某路一號'), continues: true },
      p('虛構信箱 ivy_box'),
      h(2, '工作經驗'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, confirmed));
    expect(prompt).not.toContain('虛構市某路一號');
    expect(prompt).not.toContain('ivy_box');
    expect(prompt).toContain('工作經驗');
  });
});

describe('5. 既有 Profile 的多行聯絡值', () => {
  it('各行與合併後的值都遮蔽', () => {
    const specs = [p('寄送 虛構市戊區某路'), p('之二號五樓'), p('或 虛構市戊區某路之二號五樓')];
    const { prompt } = prepareWeb(
      inputsOf(specs, { ...confirmed, profileContacts: ['虛構市戊區某路\n之二號五樓'] }),
    );
    expect(prompt).not.toContain('某路');
    expect(prompt).not.toContain('五樓');
  });
});

describe('6. 名／姓標籤', () => {
  it('First Name／Last Name 等是姓名標籤，算本次頁面姓名已辨識', () => {
    for (const label of [
      'First Name',
      'Last Name',
      'Given Name',
      'Family Name',
      'Surname',
      '名字',
      '姓氏',
    ]) {
      expect(isPersonalLabel(label)).toBe(true);
      expect(isNameLabel(label)).toBe(true);
    }
    const result = prepareWebResumeParse(
      inputsOf([lv('First Name', 'Ivy'), lv('Last Name', 'Linn'), p('Ivy Linn 門市營運')]),
      budget(1_000_000),
      idSource(),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.prompt).not.toContain('Linn');
  });
});

describe('104 履歷編輯頁結構（fixture resume-edit.html 的個人資料區，段落形式）', () => {
  it('「個人資料」下標籤與值各占一塊：超過 8 塊也不漏值；姓名元素預填中文姓名', () => {
    const specs = [
      p('林雨晴'),
      p('細心負責'),
      p('個人資料'),
      p('女 34歲 免役'),
      p('就業狀態'),
      p('待業中'),
      p('主要手機'),
      p('0900-000-000'),
      p('E-mail'),
      p('ivy.lin@example.com'),
      p('通訊地址'),
      p('高雄市苓雅區範例路***'),
      p('英文姓名'),
      p('Ivy'),
      p('聯絡方式'),
      p('(上班時段，10:00~17:00)'),
      h(2, '學歷'),
      p('範例科技大學'),
      h(2, '自傳'),
      p('林雨晴 Ivy Lin，高雄人。第一份打工在巷口的麵包店。'),
      p('Ivy Lin, from Kaohsiung. My first part-time job was at a small bakery.'),
    ];
    const { prompt, personalInfo } = prepareWeb(inputsOf(specs, { pageNames: ['林雨晴'] }));
    for (const secret of [
      '林雨晴',
      'Ivy',
      'Lin',
      '0900',
      'ivy.lin',
      '範例路',
      '34歲',
      '免役',
      '上班時段',
    ]) {
      expect(prompt).not.toContain(secret);
    }
    expect(prompt).toContain('範例科技大學');
    expect(prompt).toContain('from Kaohsiung');
    expect(personalInfo[0]?.value.value).toBe('林雨晴');
    expect(personalInfo.find((r) => r.label === '通訊地址')?.value.value).toBe(
      '高雄市苓雅區範例路***',
    );
  });
});
