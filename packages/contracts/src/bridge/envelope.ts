import { z } from 'zod';

import { RequestDraftRequest, RequestDraftResponse } from './draft.ts';
import { SubmitJobCaptureRequest, SubmitJobCaptureResponse } from './job-capture.ts';
import { SubmitMessageCaptureRequest, SubmitMessageCaptureResponse } from './message-capture.ts';
import type { BridgeOperation } from './operations.ts';

/** 任一橋接請求。op 不在清單、或任何層多帶欄位，一律被拒（strict）。 */
export const BridgeRequest = z.discriminatedUnion('op', [
  SubmitJobCaptureRequest,
  SubmitMessageCaptureRequest,
  RequestDraftRequest,
]);
export type BridgeRequest = z.infer<typeof BridgeRequest>;

/** 每個操作對應的 request／response schema。鍵必須與 BridgeOperation 完全一致。 */
export const BRIDGE_SCHEMAS = {
  submit_job_capture: { request: SubmitJobCaptureRequest, response: SubmitJobCaptureResponse },
  submit_message_capture: {
    request: SubmitMessageCaptureRequest,
    response: SubmitMessageCaptureResponse,
  },
  request_draft: { request: RequestDraftRequest, response: RequestDraftResponse },
} as const satisfies Record<BridgeOperation, { request: z.ZodType; response: z.ZodType }>;

/** 任一操作的回應（成功或 BridgeFailure）。 */
export type BridgeResponse = z.infer<(typeof BRIDGE_SCHEMAS)[BridgeOperation]['response']>;
