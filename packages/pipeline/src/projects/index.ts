/** 專案分組建議與事實項歸屬規則（D23；P1-T063）。 */
export { projectForClaim } from './assignment.ts';
export {
  GROUPING_LIMITS,
  parseGroupingOutput,
  type GroupDraft,
  type GroupingParseResult,
} from './output.ts';
export {
  prepareGrouping,
  runGrouping,
  type GroupingDocument,
  type GroupingFailure,
  type GroupingResult,
  type PreparedGrouping,
  type PrepareGroupingResult,
  type ProjectGroupSuggestion,
  type RunGroupingDeps,
  type SuggestedDocumentRef,
} from './suggest.ts';
