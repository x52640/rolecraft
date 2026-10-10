import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { snapshotNotFound } from './not-found.ts';

/** jobs.get：取得單一快照全文。 */
export const jobsGet: OpHandler<'jobs.get'> = async ({ jobSnapshotId }, services) => {
  if (!services.jobs?.get) return notImplemented();
  const snapshot = await services.jobs.get(jobSnapshotId);
  return snapshot ? { ok: true, snapshot } : snapshotNotFound();
};
