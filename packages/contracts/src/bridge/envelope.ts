import { z } from 'zod';

import {
  OpenEditorRequest,
  OpenEditorResponse,
  RequestDraftRequest,
  RequestDraftResponse,
} from './draft-and-editor.ts';
import { SubmitJobCaptureRequest, SubmitJobCaptureResponse } from './job-capture.ts';
import { SubmitMessageCaptureRequest, SubmitMessageCaptureResponse } from './message-capture.ts';
import type { BridgeOperation } from './operations.ts';

/** 任一橋接請求。op 不在清單、或任何層多帶欄位，一律被拒（strict）。 */
export const BridgeRequest = z.discriminatedUnion('op', [
  SubmitJobCaptureRequest,
  SubmitMessageCaptureRequest,
  RequestDraftRequest,
  OpenEditorRequest,
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
  open_editor: { request: OpenEditorRequest, response: OpenEditorResponse },
} as const satisfies Record<BridgeOperation, { request: z.ZodType; response: z.ZodType }>;
