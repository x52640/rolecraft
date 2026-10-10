import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { snapshotNotFound } from './not-found.ts';

/** jobs.update：修改快照欄位（有變才記為改過並清除確認）；擷取方式不能改（R10）。 */
export const jobsUpdate: OpHandler<'jobs.update'> = async ({ jobSnapshotId, fields }, services) => {
  if (!services.jobs?.update) return notImplemented();
  const updated = await services.jobs.update(jobSnapshotId, fields);
  return updated ? { ok: true } : snapshotNotFound();
};
