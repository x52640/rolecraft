/** pdf-export 公開入口：D15 中文模板 → PDF（ADR-0005）與匯出前／後檢查。 */
export const PACKAGE_NAME = '@rolecraft/pdf-export';

export {
  exportResumePdf,
  precheckDocument,
  MAX_PAGES,
  type PdfExportOutcome,
  type PdfExportReport,
  type PdfExportRequest,
  type R1Clearance,
} from './export.ts';
export { PdfExportError, type PdfExportErrorCode } from './errors.ts';
export { isBlocking, type PdfIssue, type PdfIssueCode } from './issues.ts';
export {
  validateDocument,
  type ContactItem,
  type DocumentProblem,
  type ResumeDocument,
  type TemplateItem,
  type TemplateLink,
  type TemplateSection,
} from './model.ts';
export type { FontSet } from './fonts/font-set.ts';
export { loadBundledFonts } from './fonts/bundled.ts';
export { BUNDLED_FONT_FILES, type BundledFontFile } from './fonts/manifest.ts';
export { findChrome, SUPPORTED_BROWSERS } from './render/chrome.ts';
