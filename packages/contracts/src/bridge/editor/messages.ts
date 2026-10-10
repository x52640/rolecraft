import { z } from 'zod';

import { CaptureMethod, Id, Platform } from '../../entities/common.ts';
import { MessageDraft } from '../../entities/message-draft.ts';
import { Ack, EmptyPayload, OpaqueId, bridgeOp } from '../common.ts';
import { withFailure } from '../operations.ts';

/**
 * messages.*：招募訊息與回覆草稿（F08、D6、D7；P1-T029）。
 * 貼上訊息走 submit_message_capture（captureMethod＝manual_paste），產生草稿走 request_draft。
 * 刻意沒有任何送出操作：草稿只能編輯與複製（D7）。
 */

export const MessageSummary = z.strictObject({
  messageDraftId: Id,
  platform: Platform,
  captureMethod: CaptureMethod,
  jobSnapshotId: Id.nullable(),
  replyIntent: z.string(),
  hasDraft: z.boolean(),
});
export type MessageSummary = z.infer<typeof MessageSummary>;

export const MESSAGES_SCHEMAS = {
  'messages.list': {
    request: bridgeOp('messages.list', EmptyPayload),
    response: withFailure(
      z.strictObject({ ok: z.literal(true), messages: z.array(MessageSummary) }),
    ),
  },
  'messages.get': {
    request: bridgeOp('messages.get', z.strictObject({ messageDraftId: OpaqueId })),
    response: withFailure(z.strictObject({ ok: z.literal(true), message: MessageDraft })),
  },
  /** 使用者編輯草稿文字（只存檔，不送出）。 */
  'messages.update_draft': {
    request: bridgeOp(
      'messages.update_draft',
      z.strictObject({ messageDraftId: OpaqueId, draft: z.string() }),
    ),
    response: withFailure(Ack),
  },
} as const;
