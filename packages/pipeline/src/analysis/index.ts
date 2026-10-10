/** 文件分析成事實項（F04、F05；R1、R2、R8、R9；D4、D6、D14）。 */
export { convertDrafts, segmentLabel, type DraftContext, type DraftConversion } from './drafts.ts';
export { OUTPUT_LIMITS, parseAnalysisOutput, type ParseResult } from './output.ts';
export {
  MAX_SEGMENTS_PER_UNIT,
  planAnalysis,
  type PlanAnalysisInput,
  type PlanAnalysisResult,
} from './plan.ts';
export { prepareUnit, type PrepareFailure, type PreparedUnit } from './prepare.ts';
export {
  createAnalysisRunner,
  type AnalysisRunner,
  type AnalysisRunnerDeps,
  type RunReport,
  type UnitFailure,
} from './runner.ts';
export {
  DOCUMENT_SUMMARY_MAX_CHARS,
  GLOBAL_SUMMARY_MAX_CHARS,
  mergeDocumentSummaries,
  renderGlobalSummary,
  type DocumentSummary,
} from './summary.ts';
export type {
  AnalysisDocument,
  AnalysisOutput,
  AnalysisPlan,
  AnalysisUnitSpec,
  AnalyzedVersion,
  ClaimDraft,
  ConflictDraft,
  DropReason,
  DroppedDraft,
  PlannedSegment,
  UnitAnalysisResult,
} from './types.ts';
