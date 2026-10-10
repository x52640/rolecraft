import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** messages.list：列出訊息與草稿摘要。 */
export const messagesList: OpHandler<'messages.list'> = async (_payload, services) => {
  if (!services.messages?.list) return notImplemented();
  return { ok: true, messages: await services.messages.list() };
};
