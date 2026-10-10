/** R2 來源變更判定的公開入口。 */
export { normalizeText, splitBlocks, blockFingerprint, type TextBlock } from './blocks.ts';
export {
  LOCATION_SCHEME,
  formatLocation,
  parseLocation,
  locateExcerpt,
  createSourceExcerpt,
  type ExcerptLocation,
  type LocateResult,
  type CreateExcerptResult,
} from './location.ts';
export {
  checkExcerpt,
  evaluateClaimSources,
  escalateReviewStatus,
  isUsableForGeneration,
  type SourceState,
  type ExcerptOutcome,
  type ExcerptCheck,
  type ClaimSourceEvaluation,
} from './evaluate.ts';
export {
  applyConflictMarks,
  validateConflictMark,
  type SourceConflictMark,
  type SourceConflictScope,
} from './conflict.ts';
