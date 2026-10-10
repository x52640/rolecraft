/**
 * 無法進行匯出的前提錯誤（不是內容檢查問題）。內容問題放在 PdfIssue，見 issues.ts。
 */
export type PdfExportErrorCode =
  /** R1 匯出前檢查沒通過（或沒提供）；不得匯出 */
  | 'r1_not_passed'
  /** 字型檔不存在、雜湊不符、或不是靜態 TrueType */
  | 'fonts_unavailable'
  /** 找不到可用的 Chrome（目前只驗證過 Google Chrome，ADR-0005） */
  | 'browser_not_found'
  /** Chrome 啟動或列印失敗、逾時 */
  | 'browser_failed'
  /** 產出的 PDF 無法讀回（檢查無法進行，fail closed） */
  | 'pdf_unreadable';

export class PdfExportError extends Error {
  readonly code: PdfExportErrorCode;
  constructor(code: PdfExportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PdfExportError';
    this.code = code;
  }
}
