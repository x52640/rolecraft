/** 履歷 PDF 用 AI 整理欄位（P1-T069；R1、R5、R6、R8、D6）。姓名與聯絡資料只在本機處理。 */
export { checkResumeParse, coversLines, coversWholeLines, type CheckContext } from './check.ts';
export {
  RESUME_PARSE_OUTPUT_LIMITS,
  parseResumeParseOutput,
  type ResumeParseParseResult,
} from './output.ts';
export {
  extractPersonal,
  isPersonalLabel,
  unredact,
  type PersonalExtraction,
  type PersonalRow,
} from './personal.ts';
export {
  prepareResumeParse,
  type PreparedResumeParse,
  type PrepareResumeParseResult,
  type ResumeParsePrepareFailure,
} from './prepare.ts';
export {
  RESUME_PARSE_INSTRUCTIONS,
  assembleResumeParsePrompt,
  buildResumeParsePrompt,
} from './prompt.ts';
export { runResumeParse, type ResumeParseRunResult, type RunResumeParseDeps } from './run.ts';
export { normalizeForMatch } from './text.ts';
export type {
  PersonalHint,
  RawExperience,
  RawField,
  ResumeParseInputs,
  ResumeParseOutput,
  ResumeParsePage,
  SentLine,
} from './types.ts';
