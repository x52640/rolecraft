// P1-T078 網頁來源送模型前的去個資、送出條件與提示格式（D28；resume-import「網頁來源的 AI 整理」）。
// 資料全為合成、去識別化；不呼叫真實 CLI。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import {
  INJECTION,
  NAMES,
  PAGE,
  h,
  inputsOf,
  lv,
  p,
  prepareWeb,
  tr,
} from './web-fixtures.test-helpers.ts';
import { prepareWebResumeParse } from './web-prepare.ts';

const SECRETS = [
  '林測試',
  'Alex Lin',
  '舊名字測',
  '0900-111-222',
  'sample@example.com',
  '虛構市測試區範例路一段',
  '100號3樓',
  'test_line_id',
  '虛構住址二號街五巷',
  'other@example.org',
  '02-2345-6789',
  'portfolio-sample-xyz',
];

describe('網頁來源去個資（P1-T078）', () => {
  it('提示不含姓名（只在無標籤標題）、英文別名、電話、email、多行地址、聯絡區、Profile 聯絡值', () => {
    const { prompt, lines } = prepareWeb(inputsOf(PAGE, NAMES));
    for (const secret of SECRETS) expect(prompt).not.toContain(secret);
    expect(prompt).toContain('[b1 h1] 〔姓名〕 〔姓名2〕');
    expect(prompt).toContain('[b11 h3] 資深產品經理');
    expect(prompt).toContain('[b12 標籤=職務類別] 產品企劃');
    expect(prompt).toContain('[b17 li1] 規劃訂閱產品路線圖');
    expect(prompt).toContain(INJECTION);
    // 個資標籤區塊、續行、聯絡區整塊移除（b3～b9）
    const ids = lines.map((l) => l.id);
    for (const id of ['b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']) expect(ids).not.toContain(id);
    expect(lines.find((l) => l.id === 'b10')?.text).toBe('工作經歷');
  });

  it('分成多行（continues）的地址：預填與遮蔽都是完整值', () => {
    const { personalInfo, prompt } = prepareWeb(inputsOf(PAGE, NAMES));
    const address = personalInfo.find((r) => r.label === '通訊地址');
    expect(address?.value).toEqual({
      value: '虛構市測試區範例路一段\n100號3樓',
      blockId: 'b5',
      containsPersonalData: false,
    });
    expect(prompt).not.toContain('範例路一段100號');
    expect(personalInfo.map((r) => r.label)).toEqual([
      '手機',
      'E-mail',
      '通訊地址',
      'LINE',
      '聯絡方式',
    ]);
  });

  it('同一標籤的續行不受「只留第一個」影響；第二個同標籤值不預填但一律遮蔽', () => {
    const specs = [
      lv('電話', '02-1111-0000'),
      lv('電話', '虛構分機九九九'),
      lv('住址', '測試鄉某某村'),
      lv('住址', '某某路七號', true),
      p('虛構分機九九九 與 測試鄉某某村某某路七號'),
    ];
    const { personalInfo, prompt } = prepareWeb(inputsOf(specs, { pageNames: ['林測試'] }));
    expect(personalInfo.find((r) => r.label === '電話')?.value.value).toBe('02-1111-0000');
    expect(personalInfo.find((r) => r.label === '住址')?.value.value).toBe(
      '測試鄉某某村\n某某路七號',
    );
    expect(prompt).not.toContain('虛構分機九九九');
    expect(prompt).not.toContain('某某村');
    expect(prompt).not.toContain('七號');
  });

  it('送出條件：頁面姓名沒辨識出、也沒有確認的姓名 → 拒絕、不產生提示；只有舊 Profile 姓名不算', () => {
    const run = (names: Parameters<typeof inputsOf>[1]) =>
      prepareWebResumeParse(inputsOf(PAGE, names), budget(1_000_000), idSource());
    expect(run({})).toEqual({ ok: false, reason: 'name_unconfirmed' });
    expect(run({ profileNames: ['林測試'] })).toEqual({ ok: false, reason: 'name_unconfirmed' });
    expect(run({ confirmedNames: ['  '] })).toEqual({ ok: false, reason: 'name_unconfirmed' });
    expect(run({ confirmedNames: ['林測試'] }).ok).toBe(true);
    expect(run({ pageNames: ['林測試'] }).ok).toBe(true);
    // (2) 姓名標籤的區塊值
    const labeled = [lv('姓名', '林測試'), ...PAGE];
    const result = prepareWebResumeParse(inputsOf(labeled), budget(1_000_000), idSource());
    if (!result.ok) throw new Error(result.reason);
    expect(result.prepared.personalInfo[0]).toEqual({
      label: '姓名',
      value: { value: '林測試', blockId: 'b1', containsPersonalData: false },
    });
    for (const secret of ['林測試', 'Alex Lin'])
      expect(result.prepared.prompt).not.toContain(secret);
  });

  it('姓名元素文字預填「姓名」，出處是第一個含它的區塊；找不到就不預填', () => {
    const { personalInfo } = prepareWeb(inputsOf(PAGE, { pageNames: ['林測試', 'Alex Lin'] }));
    expect(personalInfo[0]).toEqual({
      label: '姓名',
      value: { value: '林測試', blockId: 'b1', containsPersonalData: false },
    });
    const none = prepareWeb(inputsOf([p('產品經理')], { pageNames: ['林測試'] }));
    expect(none.personalInfo).toEqual([]);
  });

  it('別名：任何區塊以中文姓名開頭後接英文名都遮蔽；英文字之間沒空白也認得', () => {
    const specs = [p('林測試Jamie Chen 的作品'), p('聯絡 Jamie Chen 即可')];
    const { prompt } = prepareWeb(inputsOf(specs, { confirmedNames: ['林測試'] }));
    expect(prompt).not.toContain('Jamie Chen');
  });

  it('段落與表格的「標籤：值」、標籤獨占一行照 PDF 規則；續行一併移除', () => {
    const specs = [
      p('E-mail：'),
      p('first@example.com'),
      tr('姓名\t居住地'),
      tr('林測試\t虛構縣某鎮'),
      p('地址：虛構市甲區'),
      p('乙路三號', true),
      p('Mobile Developer：'),
      p('三年經驗'),
    ];
    const { prompt, personalInfo } = prepareWeb(inputsOf(specs));
    for (const secret of ['first@example.com', '林測試', '虛構縣某鎮', '虛構市甲區', '乙路三號']) {
      expect(prompt).not.toContain(secret);
    }
    expect(personalInfo.find((r) => r.label === '地址')?.value.value).toBe('虛構市甲區\n乙路三號');
    expect(prompt).toContain('Mobile Developer：');
    expect(prompt).toContain('三年經驗');
  });

  it('標題聯絡區移除到下一個同級或更高級標題；較低級標題不結束', () => {
    const specs = [
      h(2, '聯絡方式'),
      h(3, '社群'),
      p('虛構社群帳號 abc_def'),
      h(2, '技能'),
      p('SQL'),
    ];
    const { prompt } = prepareWeb(inputsOf(specs, { confirmedNames: ['林測試'] }));
    expect(prompt).not.toContain('社群');
    expect(prompt).not.toContain('abc_def');
    expect(prompt).toContain('[b4 h2] 技能');
  });

  it('移除後沒有區塊：no_text', () => {
    const result = prepareWebResumeParse(
      inputsOf([lv('姓名', '林測試'), lv('手機', '0900-111-222')]),
      budget(1_000_000),
      idSource(),
    );
    expect(result).toEqual({ ok: false, reason: 'no_text' });
  });
});
