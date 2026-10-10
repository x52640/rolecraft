/**
 * 真的用本機 Chrome 列印的整合測試，只在 RUN_CHROME=1 時跑（需要 Google Chrome）。
 * 字型用 __fixtures__/fonts 的小子集。
 */
import { describe, expect, it } from 'vitest';

import { loadFixtureFonts } from './__fixtures__/fonts.ts';
import { SAMPLE_DOCUMENT } from './__fixtures__/sample-document.ts';
import { exportResumePdf } from './export.ts';
import { describeFont } from './fonts/font-set.ts';
import { subsetForText } from './fonts/subset.ts';
import { inspectPdf, type PdfExpectation } from './inspect/inspect.ts';
import type { ResumeDocument } from './model.ts';
import { findChrome, printHtmlToPdf } from './render/chrome.ts';
import { buildHtml } from './template/html.ts';
import { keepWithNextTexts, printedTexts } from './template/text.ts';

const fonts = loadFixtureFonts();
const PASSED = { ok: true, issues: [] } as const;
const TIMEOUT = 60_000;

const dataUrl = (bytes: Uint8Array): string =>
  `data:font/ttf;base64,${Buffer.from(bytes).toString('base64')}`;

function expectationFor(doc: ResumeDocument, allowedFonts: string[]): PdfExpectation {
  return {
    text: printedTexts(doc).join(''),
    keepWithNext: keepWithNextTexts(doc),
    hrefs: [],
    allowedFonts,
    maxPages: 2,
  };
}

/** 跳過匯出流程，直接用指定字型列印（用來重現匯出流程刻意避開的問題）。 */
async function printRaw(doc: ResumeDocument, regular: Uint8Array, bold: Uint8Array) {
  const browser = await findChrome();
  if (browser === null) throw new Error('找不到 Chrome');
  const html = buildHtml(doc, [
    { weight: 400, url: dataUrl(regular) },
    { weight: 700, url: dataUrl(bold) },
  ]);
  return (await printHtmlToPdf(html, { executablePath: browser })).pdf;
}

function repeatSections(times: number): ResumeDocument {
  return {
    ...SAMPLE_DOCUMENT,
    sections: Array.from({ length: times }, () => SAMPLE_DOCUMENT.sections).flat(),
  };
}

describe.runIf(process.env.RUN_CHROME === '1')('Chrome 列印（RUN_CHROME=1）', () => {
  it(
    '樣本履歷：1 頁、碼位全對、連結可點、只有隨附字型且內嵌',
    async () => {
      const outcome = await exportResumePdf({ r1: PASSED, document: SAMPLE_DOCUMENT, fonts });
      expect(outcome.report.issues).toEqual([]);
      expect(outcome.ok).toBe(true);
      expect(outcome.report.pageCount).toBe(1);
      expect(outcome.report.browserVersion).toMatch(/Chrome/u);
      const text = outcome.report.extractedText;
      expect(text).toContain('林小堃');
      expect(text).not.toMatch(/[⼀-⿟]/u); // 沒有康熙部首
      if (!outcome.ok) return;
      expect(new TextDecoder('latin1').decode(outcome.pdf.slice(0, 5))).toBe('%PDF-');
    },
    TIMEOUT,
  );

  it(
    '兩頁內可匯出；超過兩頁擋下',
    async () => {
      const two = await exportResumePdf({ r1: PASSED, document: repeatSections(2), fonts });
      expect(two.report.pageCount).toBe(2);
      expect(two.report.issues.filter((i) => i.code !== 'heading_at_page_end')).toEqual([]);
      expect(two.ok).toBe(true);

      const many = await exportResumePdf({ r1: PASSED, document: repeatSections(4), fonts });
      expect(many.ok).toBe(false);
      expect(many.report.issues).toContainEqual(expect.objectContaining({ code: 'page_limit' }));
    },
    TIMEOUT,
  );

  it(
    '康熙部首回測：未裁切字型（cmap 含 ⼩）時檢查會擋；匯出流程裁切後通過',
    async () => {
      const doc: ResumeDocument = {
        name: '林小堃',
        contacts: [],
        sections: [
          { heading: '一人', items: [{ kind: 'paragraph', text: '大小口入日山工心手文' }] },
        ],
      };
      const names = [
        describeFont(fonts.regular).postscriptName,
        describeFont(fonts.bold).postscriptName,
      ];
      const raw = await inspectPdf(
        await printRaw(doc, fonts.regular, fonts.bold),
        expectationFor(doc, names),
      );
      const mismatch = raw.issues.find((i) => i.code === 'text_mismatch');
      expect(mismatch).toBeDefined();
      expect(raw.extractedText).toMatch(/[⼀-⿟]/u);

      const outcome = await exportResumePdf({ r1: PASSED, document: doc, fonts });
      expect(outcome.report.issues).toEqual([]);
      expect(outcome.report.extractedText).not.toMatch(/[⼀-⿟]/u);
    },
    TIMEOUT,
  );

  it(
    '系統字型補字：繞過缺字檢查時，PDF 內出現系統字型會被擋',
    async () => {
      const doc: ResumeDocument = {
        name: '林小堃😀',
        contacts: [],
        sections: [{ heading: '技能', items: [{ kind: 'paragraph', text: '吉野家' }] }],
      };
      const chars = printedTexts(doc).join(' ');
      const regular = await subsetForText(fonts.regular, chars);
      const bold = await subsetForText(fonts.bold, chars);
      const result = await inspectPdf(
        await printRaw(doc, regular, bold),
        expectationFor(doc, ['NotoSansTC-Regular', 'NotoSansTC-Bold']),
      );
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'foreign_font' }));
    },
    TIMEOUT,
  );

  it(
    '文字超出頁寬（不換行長字串）：Chrome 整字丟掉超出的字形，由碼位比對擋下',
    async () => {
      const browser = await findChrome();
      if (browser === null) throw new Error('找不到 Chrome');
      const text = 'W'.repeat(120);
      const html = `<!doctype html><meta charset="utf-8"><style>
        @font-face { font-family: F; src: url(${dataUrl(fonts.regular)}); }
        @page { size: A4; margin: 12mm; }
        body { margin: 0; font: 12pt F; white-space: nowrap; }
      </style><p>${text}</p>`;
      const { pdf } = await printHtmlToPdf(html, { executablePath: browser });
      const result = await inspectPdf(pdf, {
        text,
        keepWithNext: [],
        hrefs: [],
        allowedFonts: [describeFont(fonts.regular).postscriptName],
        maxPages: 2,
      });
      // P1-T038 實測：Chrome 把超出的字形整個不輸出，沒有留下跨頁緣的半個字；
      // 若哪天 Chrome 改成輸出跨頁緣字形，改由 text_out_of_page 擋。兩者任一即可。
      const codes = result.issues.map((i) => i.code);
      expect(codes.some((c) => c === 'text_mismatch' || c === 'text_out_of_page')).toBe(true);
      expect(result.extractedText.length).toBeLessThan(text.length);
    },
    TIMEOUT,
  );
});
