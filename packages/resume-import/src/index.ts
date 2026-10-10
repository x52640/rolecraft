/** resume-import 公開入口：履歷 PDF 文字層擷取（F02）。 */
export const PACKAGE_NAME = '@rolecraft/resume-import';

export { extractResumePdf } from './extract.ts';
export type {
  DraftField,
  DraftFieldStatus,
  DraftSource,
  ExtractedPage,
  ExtractFailure,
  ExtractFailureReason,
  ExtractResult,
  ExtractSuccess,
  ResumeFieldDraft,
  TextLine,
} from './types.ts';
