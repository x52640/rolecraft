/** 投遞自介（D25；R1、R8、D6、D7、D14）。沒有任何送出或投遞功能。 */
export {
  checkIntro,
  introCommitmentWarning,
  profileTexts,
  resolveIntroLabels,
  type IntroCheckContext,
  type IntroCheckProblem,
  type IntroLabelResolution,
} from './check.ts';
export { INTRO_OUTPUT_LIMITS, parseIntroOutput, type IntroParseResult } from './output.ts';
export {
  confirmedProfile,
  prepareIntro,
  type IntroPrepareFailure,
  type PreparedIntro,
  type PrepareIntroResult,
} from './prepare.ts';
export {
  INTRO_INSTRUCTIONS,
  assembleIntroPrompt,
  buildIntroPrompt,
  type IntroPromptInput,
} from './prompt.ts';
export { runIntro, type IntroRunResult, type RunIntroDeps } from './run.ts';
export type { IntroInputs, IntroOutput } from './types.ts';
