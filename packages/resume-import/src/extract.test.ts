import { describe, expect, it } from 'vitest';

import {
  column,
  LEFT_COLUMN,
  makeImageOnlyPdf,
  makePdf,
  RIGHT_COLUMN,
  SINGLE_COLUMN,
} from './__fixtures__/make-pdf.ts';
import { extractResumePdf, type ExtractResult, type ExtractSuccess } from './index.ts';

function expectOk(result: ExtractResult): ExtractSuccess {
  if (!result.ok) throw new Error(`預期成功，得到 ${result.reason}`);
  return result;
}

describe('extractResumePdf：單欄', () => {
  it('依序擷取文字並保留頁碼與位置', async () => {
    const pdf = await makePdf([column(SINGLE_COLUMN, 50, 800), column(['Page two note'], 50, 800)]);
    const result = expectOk(await extractResumePdf(pdf));
    expect(result.pageCount).toBe(2);
    expect(result.pagesWithoutText).toEqual([]);
    const [first, second] = result.pages;
    expect(first?.columns).toBe(1);
    expect(first?.lines.map((l) => l.text)).toEqual(SINGLE_COLUMN);
    expect(first?.lines[0]).toMatchObject({ pageNumber: 1, column: 0, x: 50, y: 800 });
    expect(second?.lines[0]).toMatchObject({ pageNumber: 2, text: 'Page two note' });
  });

  it('產生全部標「未確認」的欄位草稿，並附來源行', async () => {
    const result = expectOk(
      await extractResumePdf(await makePdf([column(SINGLE_COLUMN, 50, 800)])),
    );
    const { draft } = result;
    expect(draft.name).toEqual({
      value: 'Alice Chen',
      status: 'unconfirmed',
      source: { pageNumber: 1, lineIndex: 0 },
    });
    expect(draft.dates.map((f) => f.value)).toEqual(['2020/01 ~ Present', '2017.06 - 2019.12']);
    expect(draft.companies.map((f) => f.value)).toEqual(['Acme Inc.', 'Globex Corp.']);
    expect(draft.titles.map((f) => f.value)).toEqual(['Senior Engineer', 'Software Developer']);
    expect(draft.experiences.map((f) => f.value)).toEqual(SINGLE_COLUMN.slice(3, 7));
    expect(draft.skills.map((f) => f.value)).toEqual(['TypeScript', 'React', 'Node.js', 'SQL']);
    const all = [draft.name, ...draft.dates, ...draft.companies, ...draft.titles, ...draft.skills];
    expect(all.every((f) => f?.status === 'unconfirmed')).toBe(true);
  });

  it('內容串流順序打亂時仍依版面由上到下排序', async () => {
    const texts = column(SINGLE_COLUMN, 50, 800).reverse();
    const result = expectOk(await extractResumePdf(await makePdf([texts])));
    expect(result.pages[0]?.lines.map((l) => l.text)).toEqual(SINGLE_COLUMN);
  });
});

describe('extractResumePdf：雙欄', () => {
  it('跨欄標題在前，接著整個左欄、再整個右欄', async () => {
    const page = [
      // 故意先寫右欄，證明順序來自版面而不是內容串流。
      ...column(RIGHT_COLUMN, 330, 760),
      { text: 'Name: Bob Lin   |   Taipei, Taiwan   |   bob@example.com', x: 50, y: 800 },
      ...column(LEFT_COLUMN, 40, 760, 9),
    ];
    const result = expectOk(await extractResumePdf(await makePdf([page])));
    const first = result.pages[0];
    expect(first?.columns).toBe(2);
    expect(first?.lines.map((l) => l.text)).toEqual([
      'Name: Bob Lin | Taipei, Taiwan | bob@example.com',
      ...LEFT_COLUMN,
      ...RIGHT_COLUMN,
    ]);
    expect(first?.lines.filter((l) => l.column === 1).map((l) => l.text)).toEqual(RIGHT_COLUMN);
    const { draft } = result;
    expect(draft.name?.value).toBe('Bob Lin');
    expect(draft.companies.map((f) => f.value)).toEqual(['Initech Ltd.', 'Umbrella Corp.']);
    expect(draft.skills.map((f) => f.value)).toEqual(['Python', 'SQL', 'Tableau']);
    expect(draft.experiences).toHaveLength(4);
  });
});

describe('extractResumePdf：失敗要明確', () => {
  it('沒有文字層 → no_text_layer', async () => {
    const result = await extractResumePdf(await makeImageOnlyPdf());
    expect(result).toMatchObject({ ok: false, reason: 'no_text_layer' });
  });

  it('不是 PDF → invalid_pdf', async () => {
    const result = await extractResumePdf(new TextEncoder().encode('hello, not a pdf'));
    expect(result).toMatchObject({ ok: false, reason: 'invalid_pdf' });
  });

  it('文字大量重疊 → reading_order_unreliable', async () => {
    const lines = column(SINGLE_COLUMN, 50, 800);
    const shifted = lines.map((t) => ({ ...t, x: t.x + 3 }));
    const result = await extractResumePdf(await makePdf([[...lines, ...shifted]]));
    expect(result).toMatchObject({ ok: false, reason: 'reading_order_unreliable' });
  });

  it('文字大量旋轉 → reading_order_unreliable', async () => {
    const rotated = column(SINGLE_COLUMN, 300, 800).map((t, i) => ({
      ...t,
      x: 60 + i * 20,
      rotate: 90,
    }));
    const result = await extractResumePdf(await makePdf([rotated]));
    expect(result).toMatchObject({ ok: false, reason: 'reading_order_unreliable' });
  });

  it('不改動呼叫端傳入的資料', async () => {
    const pdf = await makePdf([column(SINGLE_COLUMN, 50, 800)]);
    const copy = pdf.slice();
    await extractResumePdf(pdf);
    expect(pdf).toEqual(copy);
  });
});
