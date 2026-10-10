import type { SubmitJobCaptureRequest, SubmitJobCaptureResponse } from '@rolecraft/contracts';

import { notImplemented, type HelperServices } from './services.ts';

/** submit_job_capture：職缺頁擷取內容只當資料交給服務保存。 */
export async function submitJobCapture(
  payload: SubmitJobCaptureRequest['payload'],
  services: HelperServices,
): Promise<SubmitJobCaptureResponse> {
  if (!services.jobCapture) return notImplemented();
  const { jobSnapshotId } = await services.jobCapture.submit(payload);
  return { ok: true, jobSnapshotId };
}
