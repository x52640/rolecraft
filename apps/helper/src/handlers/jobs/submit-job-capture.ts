import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** submit_job_capture：職缺頁擷取內容（或手動貼上）只當資料交給服務保存。 */
export const submitJobCapture: OpHandler<'submit_job_capture'> = async (payload, services) => {
  if (!services.jobs) return notImplemented();
  const { jobSnapshotId } = await services.jobs.submitCapture(payload);
  return { ok: true, jobSnapshotId };
};
