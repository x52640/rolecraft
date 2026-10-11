import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** analysis.status：最近一次分析工作的進度；helper 重開後仍查得到（工作狀態存資料區）。 */
export const analysisStatus: OpHandler<'analysis.status'> = async (_payload, services) => {
  if (!services.analysis?.status) return notImplemented();
  return { ok: true, analysis: await services.analysis.status() };
};
