/** 履歷用 AI 整理欄位（PDF：P1-T069；網頁區塊：P1-T078、D28；R1、R5、R6、R8、D6）。姓名與聯絡資料只在本機處理。 */
export {
  checkFields,
  checkResumeParse,
  coversLines,
  coversWholeLines,
  type CheckContext,
  type CheckedDraft,
  type FieldAdapter,
} from './check.ts';
export {
  RESUME_PARSE_OUTPUT_LIMITS,
  parseResumeParseOutput,
  type ResumeParseParseResult,
  type ResumeParseSource,
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
export {
  draftFitsLimit,
  runResumeParse,
  runWebResumeParse,
  type ResumeParseRunResult,
  type RunResumeParseDeps,
  type WebResumeParseRunResult,
} from './run.ts';
export { normalizeForMatch } from './text.ts';
export type {
  PersonalHint,
  RawExperience,
  RawField,
  ResumeParseInputs,
  ResumeParseOutput,
  ResumeParsePage,
  SentLine,
  SourceLine,
  WebResumeParseInputs,
  WebSentLine,
} from './types.ts';
export { checkWebResumeParse, currentFromContext } from './web-check.ts';
export {
  NAME_COMBINATIONS_MAX,
  splitWebBlocks,
  type WebPersonalRow,
  type WebSplit,
} from './web-personal.ts';
export {
  prepareWebResumeParse,
  type PreparedWebResumeParse,
  type PrepareWebResumeParseResult,
  type WebResumeParsePrepareFailure,
} from './web-prepare.ts';
export {
  WEB_RESUME_PARSE_INSTRUCTIONS,
  assembleWebResumeParsePrompt,
  buildWebResumeParsePrompt,
} from './web-prompt.ts';
