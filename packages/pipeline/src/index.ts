/** @rolecraft/pipeline 公開入口：分析與生成流程、提示組裝。 */
export const PACKAGE_NAME = '@rolecraft/pipeline';

export * from './analysis/index.ts';
export * from './generation/index.ts';
export {
  ANALYSIS_INSTRUCTIONS,
  MODEL_COMPLETION_STATUSES,
  buildAnalysisPrompt,
  chooseBoundary,
  dataBlock,
  documentLabelOf,
  isUsableBoundary,
} from './prompts/analysis-prompt.ts';
