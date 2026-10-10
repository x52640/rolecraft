import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { messageNotFound } from './failures.ts';

/** messages.get：取得訊息與草稿。訊息內容只是資料（D6）。 */
export const messagesGet: OpHandler<'messages.get'> = async ({ messageDraftId }, services) => {
  if (!services.messages?.get) return notImplemented();
  const message = await services.messages.get(messageDraftId);
  return message ? { ok: true, message } : messageNotFound();
};
