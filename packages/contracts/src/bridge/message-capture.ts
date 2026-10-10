import { z } from 'zod';

import { CaptureMethod, Id, NonEmptyText, Platform } from '../entities/common.ts';
import { linkedInManualOnly } from '../entities/job-snapshot.ts';
import { OpaqueId } from './common.ts';
import { withFailure } from './operations.ts';

/**
 * submit_message_capture：送入使用者選定的訊息（R7、R10、F08）。
 * 訊息內容只是資料，對方訊息內的指令不是本工具的控制命令。
 */
export const SubmitMessageCaptureRequest = z.strictObject({
  op: z.literal('submit_message_capture'),
  payload: z
    .strictObject({
      platform: Platform,
      captureMethod: CaptureMethod,
      selectedMessageText: NonEmptyText,
      jobSnapshotId: OpaqueId.nullable(),
    })
    .refine(linkedInManualOnly.check, linkedInManualOnly.params),
});
export type SubmitMessageCaptureRequest = z.infer<typeof SubmitMessageCaptureRequest>;

export const SubmitMessageCaptureResponse = withFailure(
  z.strictObject({ ok: z.literal(true), messageDraftId: Id }),
);
export type SubmitMessageCaptureResponse = z.infer<typeof SubmitMessageCaptureResponse>;
