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
    // D30 (a)：產生時的 Profile 版本號照實帶出（舊版本沒有就不帶）
    versions: sorted.map((v) => ({
      resumeVersionId: v.id,
      createdAt: v.createdAt,
      ...(v.profileVersion === undefined ? {} : { profileVersion: v.profileVersion }),
    })),
  };
};
