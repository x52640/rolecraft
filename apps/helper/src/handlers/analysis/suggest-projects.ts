import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { analysisFailure } from './failure.ts';

/**
 * analysis.suggest_projects：使用者按下才觸發，背景請 AI 建議專案分組（D23、P1-T063）。
 * 不建立任何專案；沒有模型、沒有可分組文件、超過預算回 invalid_request，不呼叫模型。
 */
export const analysisSuggestProjects: OpHandler<'analysis.suggest_projects'> = async (
  _payload,
  services,
) => {
  if (!services.analysis?.suggestProjects) return notImplemented();
  const result = await services.analysis.suggestProjects();
  return result.ok ? { ok: true, suggestion: result.suggestion } : analysisFailure(result.reason);
};
