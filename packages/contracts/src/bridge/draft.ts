import { z } from 'zod';

import { Id } from '../entities/common.ts';
import { withFailure } from './operations.ts';

/**
 * request_draft：要求產生回覆草稿（R7、F08）。
 * 只帶已存在的訊息 id 與意圖；服務與模型由 helper 決定，不由呼叫端指定。
 */
export const RequestDraftRequest = z.strictObject({
  op: z.literal('request_draft'),
  payload: z.strictObject({
    messageDraftId: Id,
    replyIntent: z.string(),
  }),
});
export type RequestDraftRequest = z.infer<typeof RequestDraftRequest>;

/** 草稿生成是長工作（R9），回傳工作 id。 */
export const RequestDraftResponse = withFailure(
  z.strictObject({ ok: z.literal(true), workJobId: Id }),
);
export type RequestDraftResponse = z.infer<typeof RequestDraftResponse>;
