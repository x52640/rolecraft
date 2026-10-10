/**
 * 匯出前／後檢查發現的問題（F07：中文字型、缺字、文字截斷、分頁、連結、空白頁）。
 * severity 為 block 的問題一律不得匯出；warning 只提示。
 */
import type { DocumentProblem } from './model.ts';

export type PdfIssue =
  /** 輸入結構問題（空白欄位、控制字元、不安全連結） */
  | ({ readonly code: 'invalid_document' } & DocumentProblem)
  /** 字型沒有這些字的字形（匯出前擋，避免 Chrome 用系統字型補字） */
  | {
      readonly code: 'missing_glyph';
      readonly chars: readonly { readonly char: string; readonly codePoint: string }[];
    }
  /**
   * 從 PDF 擷取回來的文字和原文碼位不同：缺字、被截掉、多出字，或「小」變康熙部首「⼩」。
   * offset 是去空白後原文的第幾個字（UTF-16 索引）。
   */
  | {
      readonly code: 'text_mismatch';
      readonly offset: number;
      readonly expected: string;
      readonly actual: string;
    }
  /**
   * 字形（一部分）畫在頁面外：pdfjs 只丟掉整個落在頁外的字，跨過頁緣的字仍會擷取到，
   * 碼位比對抓不到，但印出來被裁掉。text 是該段文字。
   */
  | { readonly code: 'text_out_of_page'; readonly page: number; readonly text: string }
  /** 超過 D15 的 2 頁上限 */
  | { readonly code: 'page_limit'; readonly pages: number; readonly max: number }
  /** 整頁沒有文字 */
  | { readonly code: 'blank_page'; readonly page: number }
  /** PDF 內出現隨附字型以外的字型（系統字型補字） */
  | { readonly code: 'foreign_font'; readonly fontName: string }
  /** 字型沒有內嵌，或被輸出成 Type3（不是真字型） */
  | { readonly code: 'font_not_embedded'; readonly fontName: string; readonly subtype: string }
  /** 原文有連結、PDF 內沒有可點擊的對應連結 */
  | { readonly code: 'link_missing'; readonly href: string }
  /** PDF 內有原文沒有的連結 */
  | { readonly code: 'link_unexpected'; readonly href: string }
  /** 標題落在頁尾、內容在下一頁（警告） */
  | { readonly code: 'heading_at_page_end'; readonly page: number; readonly text: string };

export type PdfIssueCode = PdfIssue['code'];

const WARNINGS: ReadonlySet<PdfIssueCode> = new Set<PdfIssueCode>(['heading_at_page_end']);

export function isBlocking(issue: PdfIssue): boolean {
  return !WARNINGS.has(issue.code);
}
