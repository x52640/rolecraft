import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** analysis.project_suggestion：最近一次分組建議（只在 helper 記憶體）；沒有回 null。 */
export const analysisProjectSuggestion: OpHandler<'analysis.project_suggestion'> = async (
  _payload,
  services,
) => {
  if (!services.analysis?.projectSuggestion) return notImplemented();
  return { ok: true, suggestion: await services.analysis.projectSuggestion() };
};
