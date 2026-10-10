import { describe, expect, it } from 'vitest';

import { loadFixtureFonts } from './__fixtures__/fonts.ts';
import { SAMPLE_DOCUMENT } from './__fixtures__/sample-document.ts';
import { exportResumePdf, precheckDocument, type R1Clearance } from './export.ts';
import { isBlocking } from './issues.ts';

const fonts = loadFixtureFonts();
const PASSED: R1Clearance = { ok: true, issues: [] };
/** 不存在的瀏覽器：測試只走到匯出前就該結束，不會真的啟動 Chrome。 */
const NO_BROWSER = '/nonexistent/chrome';

describe('R1 閘門', () => {
  it.each<[string, unknown]>([
    ['ok 為 false', { ok: false, issues: [{ code: 'x' }] }],
    ['ok 為 true 但仍有問題', { ok: true, issues: [{ code: 'x' }] }],
    ['沒有提供', undefined],
    ['ok 不是布林 true', { ok: 'true', issues: [] }],
    ['issues 不是陣列', { ok: true, issues: 'none' }],
  ])('%s → 拒絕匯出', async (_label, r1) => {
    await expect(
      exportResumePdf({
        r1: r1 as R1Clearance,
        document: SAMPLE_DOCUMENT,
        fonts,
        browserPath: NO_BROWSER,
      }),
    ).rejects.toMatchObject({ name: 'PdfExportError', code: 'r1_not_passed' });
  });

  it('R1 先於其他檢查（即使文件本身也有問題）', async () => {
    await expect(
      exportResumePdf({
        r1: { ok: false, issues: [] },
        document: { ...SAMPLE_DOCUMENT, name: '' },
        fonts,
        browserPath: NO_BROWSER,
      }),
    ).rejects.toMatchObject({ code: 'r1_not_passed' });
  });
});

describe('匯出前檢查（不需 Chrome）', () => {
  it('樣本文件與 fixture 字型沒有問題', () => {
    expect(precheckDocument(SAMPLE_DOCUMENT, fonts)).toEqual([]);
  });

  it('缺字時不列印、回傳缺字清單', async () => {
    const outcome = await exportResumePdf({
      r1: PASSED,
      document: { ...SAMPLE_DOCUMENT, headline: '吉野家𠮷' },
      fonts,
      browserPath: NO_BROWSER,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.pageCount).toBe(0);
    expect(outcome.report.issues).toEqual([
      {
        code: 'missing_glyph',
        chars: [
          { char: '吉', codePoint: 'U+5409' },
          { char: '野', codePoint: 'U+91CE' },
          { char: '家', codePoint: 'U+5BB6' },
          { char: '𠮷', codePoint: 'U+20BB7' },
        ],
      },
    ]);
    expect(outcome.report.issues.every(isBlocking)).toBe(true);
  });

  it('不安全連結不列印', async () => {
    const outcome = await exportResumePdf({
      r1: PASSED,
      document: { ...SAMPLE_DOCUMENT, contacts: [{ text: '連結', href: 'javascript:alert(1)' }] },
      fonts,
      browserPath: NO_BROWSER,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.report.issues).toEqual([
      { code: 'invalid_document', path: 'contacts[0].href', reason: 'unsafe_href' },
    ]);
  });

  it('檢查通過但瀏覽器不存在時丟 browser_failed，不回傳 PDF', async () => {
    await expect(
      exportResumePdf({ r1: PASSED, document: SAMPLE_DOCUMENT, fonts, browserPath: NO_BROWSER }),
    ).rejects.toMatchObject({ code: 'browser_failed' });
  });

  it('不是字型的資料直接拒絕', async () => {
    await expect(
      exportResumePdf({
        r1: PASSED,
        document: SAMPLE_DOCUMENT,
        fonts: { regular: new Uint8Array(8), bold: fonts.bold },
        browserPath: NO_BROWSER,
      }),
    ).rejects.toMatchObject({ code: 'fonts_unavailable' });
  });
});
