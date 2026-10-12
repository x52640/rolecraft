/** resume-import 公開入口：履歷 PDF 文字層擷取（F02）。 */
export const PACKAGE_NAME = '@rolecraft/resume-import';

export { cleanHeaderName, headerNameCandidate } from './draft/header-name.ts';
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
  StructuredDraft,
  StructuredExperience,
  TextLine,
} from './types.ts';
