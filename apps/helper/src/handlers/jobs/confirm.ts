import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { snapshotNotFound } from './not-found.ts';

/** jobs.confirm：使用者確認快照；確認後才能用於生成（R10）。確認時間由 helper 決定。 */
export const jobsConfirm: OpHandler<'jobs.confirm'> = async ({ jobSnapshotId }, services) => {
  if (!services.jobs?.confirm) return notImplemented();
  const confirmed = await services.jobs.confirm(jobSnapshotId);
  return confirmed ? { ok: true } : snapshotNotFound();
};
