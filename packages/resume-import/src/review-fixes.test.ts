/** codex 補審（3c5e934）回歸：CMap 路徑、欄間距挑選、逐頁錯誤分類、同行欄位分隔。 */
import { describe, expect, it } from 'vitest';

import { makeBrokenPagePdf, makeCidChinesePdf } from './__fixtures__/make-pdf.ts';
import { buildDraft } from './draft/build-draft.ts';
import { extractResumePdf } from './index.ts';
import { findGutter, groupLines, layoutPage } from './pdf/layout.ts';
import { readTextLayer } from './pdf/read-text-layer.ts';
import type { TextRun } from './types.ts';

const run = (x: number, y: number, text = 'word', width = 100): TextRun => ({
  text,
  x,
  y,
  width,
  height: 10,
  rotated: false,
});

describe('中文 CID 字型（UniCNS-UCS2-H，靠 pdfjs 隨附 CMap 解碼）', () => {
  it('讀得出中文文字層', async () => {
    const pages = await readTextLayer(makeCidChinesePdf(['中文履歷']));
    expect(pages[0]?.runs.map((r) => r.text).join('')).toBe('中文履歷');
  });

  it('整條擷取流程產生中文草稿', async () => {
    const pdf = makeCidChinesePdf([
      '姓名：王小明',
      '工作經歷',
      '2020/01 ~ 至今｜宏達股份有限公司｜資深工程師',
      '技能',
      'TypeScript、React、SQL',
    ]);
    const result = await extractResumePdf(pdf);
    if (!result.ok) throw new Error(`預期成功，得到 ${result.reason}`);
    expect(result.draft.name?.value).toBe('王小明');
    expect(result.draft.companies.map((f) => f.value)).toEqual(['宏達股份有限公司']);
    expect(result.draft.skills.map((f) => f.value)).toEqual(['TypeScript', 'React', 'SQL']);
  });
});

describe('逐頁讀取錯誤', () => {
  it('頁物件壞掉 → invalid_pdf，不丟未分類的例外', async () => {
    await expect(extractResumePdf(makeBrokenPagePdf())).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_pdf',
    });
  });
});

describe('欄間距', () => {
  it('右欄外側的空白比欄間距寬時，仍判為雙欄', () => {
    const runs = [
      run(50, 700),
      run(50, 680),
      run(50, 660),
      run(220, 700),
      run(220, 680),
      run(220, 660),
    ];
    expect(findGutter(runs, 595)).toEqual({ start: 150, end: 220 });
  });
});

describe('同一行大間距隔開的欄位', () => {
  const header = [
    run(50, 700, 'Name: Alice Chen', 90),
    run(200, 700, 'Taipei', 40),
    run(300, 700, 'alice@example.com', 90),
  ];

  it('以 Tab 分隔，不併成一句', () => {
    expect(groupLines(header, 1, 0)[0]?.text).toBe('Name: Alice Chen\tTaipei\talice@example.com');
  });

  it('一般字距仍是空白', () => {
    const words = [run(50, 700, 'Senior', 30), run(83, 700, 'Engineer', 40)];
    expect(groupLines(words, 1, 0)[0]?.text).toBe('Senior Engineer');
  });

  it('姓名草稿只取第一個欄位', () => {
    const page = layoutPage({ pageNumber: 1, width: 595, height: 842, runs: header });
    expect(buildDraft([page]).name?.value).toBe('Alice Chen');
  });
});
