import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { analysisFailure } from './failure.ts';

/**
 * analysis.start：對目前授權集合做增量分析，回工作 id；已暫停就續跑（只由使用者觸發，D21）。
 * 服務沒接上（沒有資料區）回 not_implemented，不偽造成功。
 */
export const analysisStart: OpHandler<'analysis.start'> = async (_payload, services) => {
  if (!services.analysis?.start) return notImplemented();
  const result = await services.analysis.start();
  return result.ok ? { ok: true, workJobId: result.workJobId } : analysisFailure(result.reason);
};
