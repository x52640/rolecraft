import { z } from 'zod';

import { RequestDraftRequest, RequestDraftResponse } from './draft.ts';
import { APPLICATIONS_SCHEMAS } from './editor/applications.ts';
import { CLAIMS_SCHEMAS } from './editor/claims.ts';
import { EXPORT_SCHEMAS } from './editor/export.ts';
import { IMPORT_SCHEMAS } from './editor/import.ts';
import { JOBS_SCHEMAS } from './editor/jobs.ts';
import { MESSAGES_SCHEMAS } from './editor/messages.ts';
import { PROVIDERS_SCHEMAS } from './editor/providers.ts';
import { RESUME_SCHEMAS } from './editor/resume.ts';
import { SOURCES_SCHEMAS } from './editor/sources.ts';
import { SubmitJobCaptureRequest, SubmitJobCaptureResponse } from './job-capture.ts';
import { SubmitMessageCaptureRequest, SubmitMessageCaptureResponse } from './message-capture.ts';
import type { BridgeOperation } from './operations.ts';

/** 每個操作對應的 request／response schema。鍵必須與 BridgeOperation 完全一致（測試鎖住）。 */
export const BRIDGE_SCHEMAS = {
  submit_job_capture: { request: SubmitJobCaptureRequest, response: SubmitJobCaptureResponse },
  submit_message_capture: {
    request: SubmitMessageCaptureRequest,
    response: SubmitMessageCaptureResponse,
  },
  request_draft: { request: RequestDraftRequest, response: RequestDraftResponse },
  ...JOBS_SCHEMAS,
  ...IMPORT_SCHEMAS,
  ...SOURCES_SCHEMAS,
  ...APPLICATIONS_SCHEMAS,
  ...PROVIDERS_SCHEMAS,
  ...EXPORT_SCHEMAS,
  ...CLAIMS_SCHEMAS,
  ...RESUME_SCHEMAS,
  ...MESSAGES_SCHEMAS,
} as const satisfies Record<BridgeOperation, { request: z.ZodType; response: z.ZodType }>;

type RequestSchemaOf<Op extends BridgeOperation> = (typeof BRIDGE_SCHEMAS)[Op]['request'];

/** 所有 request schema（順序不影響驗證；型別斷言只是把陣列標成非空 tuple）。 */
const ALL_REQUESTS = Object.values(BRIDGE_SCHEMAS).map((entry) => entry.request) as [
  RequestSchemaOf<BridgeOperation>,
  ...RequestSchemaOf<BridgeOperation>[],
];

/** 任一橋接請求。op 不在清單、或任何層多帶欄位，一律被拒（strict）。 */
export const BridgeRequest = z.discriminatedUnion('op', ALL_REQUESTS);
export type BridgeRequest = z.infer<typeof BridgeRequest>;

/** 某操作的請求型別。 */
export type BridgeRequestOf<Op extends BridgeOperation> = z.infer<RequestSchemaOf<Op>>;

/** 某操作的回應型別（成功或 BridgeFailure）。 */
export type BridgeResponseOf<Op extends BridgeOperation> = z.infer<
  (typeof BRIDGE_SCHEMAS)[Op]['response']
>;

/** 任一操作的回應（成功或 BridgeFailure）。 */
export type BridgeResponse = BridgeResponseOf<BridgeOperation>;
