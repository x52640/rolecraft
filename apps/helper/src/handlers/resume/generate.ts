import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { resumeFailure } from './failure.ts';

/**
 * resume.generate：只用已確認的職缺快照產生客製履歷，回工作 id（R9、R10）。
 * 模型執行沒有接上時回 not_implemented，不偽造成功。
 */
export const resumeGenerate: OpHandler<'resume.generate'> = async (payload, services) => {
  if (!services.resume?.generate) return notImplemented();
  const result = await services.resume.generate(payload.jobSnapshotId);
  return result.ok ? { ok: true, workJobId: result.workJobId } : resumeFailure(result.reason);
};
