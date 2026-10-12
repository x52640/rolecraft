// P1-T078 網頁來源的照抄檢查、來源編號格式與草稿大小上限（D28 W3、W7、W8）。PDF 也套用大小上限。
// 資料全為合成、去識別化；一律用假 provider，不呼叫真實 CLI。
import { describe, expect, it } from 'vitest';

import { budget, idSource } from '../generation/fixtures.test-helpers.ts';
import { parseResumeParseOutput } from './output.ts';
import { prepareResumeParse } from './prepare.ts';
import { runResumeParse, runWebResumeParse } from './run.ts';
import type { ResumeParseOutput } from './types.ts';
import { NAMES, PAGE, f, fakeDeps, inputsOf, p, prepareWeb } from './web-fixtures.test-helpers.ts';

const prepared = () => prepareWeb(inputsOf(PAGE, NAMES));
const sentText = (id: string) => prepared().lines.find((l) => l.id === id)?.text ?? '';

const EMPTY: ResumeParseOutput = { education: [], experiences: [], skills: [], sections: [] };
const exp = (fields: Partial<ResumeParseOutput['experiences'][number]>) => ({
  company: null,
  title: null,
  start: null,
  end: null,
  description: null,
  ...fields,
});

async function runWeb(output: unknown, input = prepared()) {
  const { deps } = fakeDeps({ text: JSON.stringify(output) });
  return runWebResumeParse(input, deps);
}

describe('網頁來源照抄檢查（P1-T078）', () => {
  it('區塊為來源：切開的描述、「2019/03」「~」「至今」三個區塊被接受；出處是區塊編號', async () => {
    const output: ResumeParseOutput = {
      ...EMPTY,
      experiences: [
        exp({
          company: f('範例科技有限公司', 'b13'),
          title: f('資深產品經理', 'b11'),
          start: f('2019/03', 'b14'),
          end: f('至今', 'b16'),
          description: f(
            '規劃訂閱產品路線圖：協調設計與工程團隊，縮短上線時程。\n建立 A/B testing 指標儀表板。',
            'b17',
            'b18',
            'b19',
          ),
        }),
      ],
      skills: [f('產品企劃', 'b12')],
    };
    const result = await runWeb(output);
    if (!result.ok) throw new Error(result.failure);
    const [first] = result.draft.experiences;
    expect(first?.current).toBe(true);
    expect(first?.endDate).toBeNull();
    expect(first?.startDate).toEqual({
      value: '2019/03',
      blockId: 'b14',
      containsPersonalData: false,
    });
    expect(first?.description?.blockId).toBe('b17');
    expect(result.draft.skills.map((s) => s.value)).toEqual(['產品企劃']);
    expect(result.draft.discarded).toEqual([]);
    expect(result.draft.personalInfo.map((r) => r.label)).toContain('通訊地址');
  });

  it('捏造、標籤當來源文字、「2020 年得獎作品」後的至今、隔標題的至今都被丟棄', async () => {
    const output: ResumeParseOutput = {
      ...EMPTY,
      experiences: [
        exp({ title: f('2020 年得獎作品', 'b20'), end: f('至今', 'b21') }),
        exp({ company: f('範例科技有限公司', 'b13'), end: f('至今', 'b24') }),
        exp({ company: f('宇宙第一公司', 'b13') }),
      ],
      skills: [f('Rust', 'b19'), f('職務類別', 'b12'), f('SQL', 'b3')],
    };
    const result = await runWeb(output);
    if (!result.ok) throw new Error(result.failure);
    expect(result.draft.experiences.map((e) => e.current)).toEqual([false, false]);
    expect(result.draft.skills).toEqual([]);
    expect(result.draft.discarded).toEqual([
      { field: '第 1 段經歷結束日期', reason: 'not_a_date' },
      { field: '第 2 段經歷結束日期', reason: 'not_a_date' },
      { field: '第 3 段經歷公司', reason: 'not_in_source' },
      { field: '第 1 項技能', reason: 'not_in_source' },
      { field: '第 2 項技能', reason: 'not_in_source' },
      { field: '第 3 項技能', reason: 'unknown_line' },
    ]);
  });

  it('「至今」的引用只能是獨占的那個區塊；中間隔著移除的區塊或非日期都不算', async () => {
    const specs = [p('2019/03 ~'), p('至今'), p('2018/05'), p('電話：02-1111-0000'), p('至今')];
    const input = prepareWeb(inputsOf(specs, { confirmedNames: ['林測試'] }));
    const output: ResumeParseOutput = {
      ...EMPTY,
      experiences: [
        exp({ start: f('2019/03', 'b1'), end: f('至今', 'b2') }),
        exp({ end: f('至今', 'b1', 'b2') }),
        exp({ start: f('2018/05', 'b3'), end: f('至今', 'b5') }),
      ],
    };
    const result = await runWeb(output, input);
    if (!result.ok) throw new Error(result.failure);
    expect(result.draft.experiences.map((e) => e.current)).toEqual([true, false]);
    expect(result.draft.discarded).toEqual([
      { field: '第 2 段經歷結束日期', reason: 'not_in_source' },
      { field: '第 3 段經歷結束日期', reason: 'not_a_date' },
    ]);
  });

  it('還原出姓名或個資的欄位標 containsPersonalData', async () => {
    const body = sentText('b26');
    expect(body).toContain('〔姓名〕');
    const output = { ...EMPTY, sections: [{ heading: f('自傳', 'b25'), body: f(body, 'b26') }] };
    const result = await runWeb(output);
    if (!result.ok) throw new Error(result.failure);
    const [section] = result.draft.otherSections;
    expect(section?.heading.containsPersonalData).toBe(false);
    expect(section?.body.containsPersonalData).toBe(true);
    expect(section?.body.value).toBe(PAGE[25]?.text);
  });

  it('來源編號依來源種類驗證：網頁用「頁-行」、PDF 用區塊編號，整份不合格', async () => {
    const pdfIds = { ...EMPTY, skills: [f('產品企劃', '1-12')] };
    expect(parseResumeParseOutput(JSON.stringify(pdfIds), 'web').ok).toBe(false);
    expect(await runWeb(pdfIds)).toEqual({ ok: false, failure: 'invalid_output' });
    const webIds = { ...EMPTY, skills: [f('產品企劃', 'b12')] };
    expect(parseResumeParseOutput(JSON.stringify(webIds)).ok).toBe(false);
    expect(parseResumeParseOutput(JSON.stringify(webIds), 'web').ok).toBe(true);
    expect(
      parseResumeParseOutput(JSON.stringify({ ...EMPTY, skills: [f('x', 'b0')] }), 'web').ok,
    ).toBe(false);
  });
});

describe('草稿大小上限 512 KiB（D28 W3，PDF 與網頁共用）', () => {
  const big = '測'.repeat(5000);
  const sections = (n: number, heading: string, body: string) =>
    Array.from({ length: n }, () => ({ heading: f('自傳', heading), body: f(big, body) }));

  it('網頁：模型重複照抄同一大區塊、草稿超過上限 → 整份失敗；上限內照常', async () => {
    const input = prepareWeb(inputsOf([p('自傳'), p(big)], { confirmedNames: ['林測試'] }));
    const over = await runWeb({ ...EMPTY, sections: sections(40, 'b1', 'b2') }, input);
    expect(over).toEqual({ ok: false, failure: 'invalid_output' });
    const under = await runWeb({ ...EMPTY, sections: sections(10, 'b1', 'b2') }, input);
    expect(under.ok).toBe(true);
  });

  it('PDF 也套用', async () => {
    const result = prepareResumeParse(
      { pages: [{ pageNumber: 1, lines: ['自傳', big] }], names: [], personalHints: [] },
      budget(1_000_000),
      idSource(),
    );
    if (!result.ok) throw new Error(result.reason);
    const run = async (n: number) => {
      const { deps } = fakeDeps({
        text: JSON.stringify({ ...EMPTY, sections: sections(n, '1-1', '1-2') }),
      });
      return runResumeParse(result.prepared, deps);
    };
    expect(await run(40)).toEqual({ ok: false, failure: 'invalid_output' });
    expect((await run(10)).ok).toBe(true);
  });
});
