import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { resumeFailure } from './failure.ts';

/** resume.list：某職缺的履歷版本（新到舊）。 */
export const resumeList: OpHandler<'resume.list'> = async (payload, services) => {
  if (!services.resume?.list) return notImplemented();
  const versions = await services.resume.list(payload.jobSnapshotId);
  if (versions === null) return resumeFailure('snapshot_not_found');
  const sorted = [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    ok: true,
    versions: sorted.map((v) => ({ resumeVersionId: v.id, createdAt: v.createdAt })),
  };
};
