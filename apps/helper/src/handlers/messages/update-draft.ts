import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { messageNotFound } from './failures.ts';

/** messages.update_draft：儲存使用者編輯的草稿；只存檔，沒有任何送出（D7）。 */
export const messagesUpdateDraft: OpHandler<'messages.update_draft'> = async (
  { messageDraftId, draft },
  services,
) => {
  if (!services.messages?.updateDraft) return notImplemented();
  const saved = await services.messages.updateDraft(messageDraftId, draft);
  return saved ? { ok: true } : messageNotFound();
};
