/**
 * 公開匯出流程：R1 閘門 → 結構檢查 → 缺字檢查 → 裁字型 → Chrome 列印 → 讀回檢查。
 * 只有全部阻擋性檢查通過才回傳 PDF bytes；建立 ExportVersion 由呼叫端（helper）負責。
 */
import { PdfExportError } from './errors.ts';
import { describeFont, findMissingGlyphs, type FontSet } from './fonts/font-set.ts';
import { assertStaticTrueType } from './fonts/bundled.ts';
import { subsetForText } from './fonts/subset.ts';
import { inspectPdf } from './inspect/inspect.ts';
import { isBlocking, type PdfIssue } from './issues.ts';
import { collectHrefs, validateDocument, type ResumeDocument } from './model.ts';
import { findChrome, printHtmlToPdf } from './render/chrome.ts';
import { buildHtml } from './template/html.ts';
import { keepWithNextTexts, printedTexts, usedCharacters } from './template/text.ts';

/** D15：首版中文模板 1–2 頁。 */
export const MAX_PAGES = 2;

/**
 * R1 匯出前檢查的結果（與 @rolecraft/domain 的 ExportCheckResult 結構相容；本套件不得依賴 domain）。
 * 必須是 ok 為 true 且沒有任何問題，否則拒絕匯出。
 */
export interface R1Clearance {
  readonly ok: boolean;
  readonly issues: readonly unknown[];
}

export interface PdfExportRequest {
  /** 必須是針對「這份文件的內容」跑出的 R1 結果 */
  readonly r1: R1Clearance;
  readonly document: ResumeDocument;
  readonly fonts: FontSet;
  /** 省略則自動找已支援的 Chrome */
  readonly browserPath?: string;
  readonly timeoutMs?: number;
}

export interface PdfExportReport {
  /** 全部問題（含警告） */
  readonly issues: readonly PdfIssue[];
  /** 0 表示沒有列印（匯出前就被擋） */
  readonly pageCount: number;
  readonly browserVersion: string | null;
  /** 擷取回來的全文，供除錯；未列印時為空字串 */
  readonly extractedText: string;
}

export type PdfExportOutcome =
  | { readonly ok: true; readonly pdf: Uint8Array; readonly report: PdfExportReport }
  | { readonly ok: false; readonly report: PdfExportReport };

function assertR1Passed(r1: R1Clearance | undefined): void {
  // 執行期再檢查一次：呼叫端可能以 any 或 JSON 繞過型別。
  if (r1?.ok !== true || !Array.isArray(r1.issues) || r1.issues.length !== 0) {
    throw new PdfExportError('r1_not_passed', 'R1 匯出前檢查未通過，不得匯出。');
  }
}

function blocked(issues: readonly PdfIssue[]): PdfExportOutcome {
  return {
    ok: false,
    report: { issues, pageCount: 0, browserVersion: null, extractedText: '' },
  };
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:font/ttf;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** 匯出前檢查（不需要 Chrome）：結構與缺字。 */
export function precheckDocument(document: ResumeDocument, fonts: FontSet): PdfIssue[] {
  const problems = validateDocument(document).map((p): PdfIssue => ({
    code: 'invalid_document',
    ...p,
  }));
  const missing = findMissingGlyphs(usedCharacters(document), [
    describeFont(fonts.regular),
    describeFont(fonts.bold),
  ]);
  return missing.length === 0 ? problems : [...problems, { code: 'missing_glyph', chars: missing }];
}

/** 產生 PDF bytes＋檢查結果。前提錯誤（R1、字型、瀏覽器）丟 PdfExportError。 */
export async function exportResumePdf(request: PdfExportRequest): Promise<PdfExportOutcome> {
  assertR1Passed(request.r1);
  const { document, fonts } = request;
  assertStaticTrueType(fonts.regular, '一般字重字型');
  assertStaticTrueType(fonts.bold, '粗體字型');

  const preIssues = precheckDocument(document, fonts);
  if (preIssues.length > 0) return blocked(preIssues);

  const chars = usedCharacters(document);
  const [regular, bold] = await Promise.all([
    subsetForText(fonts.regular, chars),
    subsetForText(fonts.bold, chars),
  ]);
  const html = buildHtml(document, [
    { weight: 400, url: toDataUrl(regular) },
    { weight: 700, url: toDataUrl(bold) },
  ]);

  const browserPath = request.browserPath ?? (await findChrome());
  if (browserPath === null) {
    throw new PdfExportError('browser_not_found', '找不到已安裝的 Google Chrome。');
  }
  const printed = await printHtmlToPdf(html, {
    executablePath: browserPath,
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
  });

  const inspection = await inspectPdf(printed.pdf, {
    text: printedTexts(document).join(''),
    keepWithNext: keepWithNextTexts(document),
    hrefs: collectHrefs(document),
    allowedFonts: [describeFont(regular).postscriptName, describeFont(bold).postscriptName],
    maxPages: MAX_PAGES,
  });
  const report: PdfExportReport = {
    issues: inspection.issues,
    pageCount: inspection.pageCount,
    browserVersion: printed.browserVersion,
    extractedText: inspection.extractedText,
  };
  return inspection.issues.some(isBlocking)
    ? { ok: false, report }
    : { ok: true, pdf: printed.pdf, report };
}
