import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** messages.update_draft：儲存使用者編輯的草稿（不送出）。由 P1-T029 實作；接上前回 not_implemented，不偽造成功。 */
export const messagesUpdateDraft: OpHandler<'messages.update_draft'> = () =>
  Promise.resolve(notImplemented());
