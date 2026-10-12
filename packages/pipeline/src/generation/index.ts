/** 職缺匹配與段落生成（F07；R1、R2、R9、R10；D4、D6、D14）。 */
export { COMPLETION_LABELS, completionCap, exceedsCap } from './completion.ts';
export {
  GENERATION_OUTPUT_LIMITS,
  parseGenerationOutput,
  type GenerationParseResult,
} from './output.ts';
export {
  planGeneration,
  prepareGeneration,
  usableClaims,
  type GenerationPrepareFailure,
  type PlanGenerationResult,
  type PreparedGeneration,
} from './prepare.ts';
export {
  GENERATION_INSTRUCTIONS,
  assembleGenerationPrompt,
  buildGenerationPrompt,
  claimLabel,
  experienceLabel,
  type GenerationPromptInput,
} from './prompt.ts';
export {
  createGenerationRunner,
  type GenerationReport,
  type GenerationRunner,
  type GenerationRunnerDeps,
} from './runner.ts';
export { FALLBACK_RATIONALE } from './experience-fallback.ts';
export { convertGeneration, type SectionContext, type SectionConversion } from './sections.ts';
export type {
  CitationDraft,
  DroppedSection,
  GapDraft,
  GenerationInputs,
  GenerationOutput,
  GenerationPlan,
  GenerationResult,
  InformationGap,
  MatchDraft,
  PlacementDraft,
  RequirementMatch,
  SectionDraft,
  SectionDropReason,
  SectionPlacement,
} from './types.ts';
