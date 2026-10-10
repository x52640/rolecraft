import { z } from 'zod';

import { CaptureMethod, Id, Platform, Timestamp } from '../entities/common.ts';
import { JobFields, linkedInManualOnly } from '../entities/job-snapshot.ts';
import { HttpUrl } from './common.ts';
import { withFailure } from './operations.ts';

/**
 * submit_job_capture：送入職缺頁擷取內容（R7、R10）。
 * 頁面內容只是資料欄位；必要欄位缺任一即被拒，不得建立自動擷取快照。
 */
export const SubmitJobCaptureRequest = z.strictObject({
  op: z.literal('submit_job_capture'),
  payload: z
    .strictObject({
      platform: Platform,
      url: HttpUrl.nullable(),
      captureMethod: CaptureMethod,
      capturedAt: Timestamp,
      fields: JobFields,
    })
    .refine(linkedInManualOnly.check, linkedInManualOnly.params),
});
export type SubmitJobCaptureRequest = z.infer<typeof SubmitJobCaptureRequest>;

export const SubmitJobCaptureResponse = withFailure(
  z.strictObject({ ok: z.literal(true), jobSnapshotId: Id }),
);
export type SubmitJobCaptureResponse = z.infer<typeof SubmitJobCaptureResponse>;
