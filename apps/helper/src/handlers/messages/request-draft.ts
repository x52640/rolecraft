import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** request_draft：只排入工作並回工作 ID；草稿不會自動送出（D7）。 */
export const requestDraft: OpHandler<'request_draft'> = async (payload, services) => {
  if (!services.messages) return notImplemented();
  const { workJobId } = await services.messages.requestDraft(payload);
  return { ok: true, workJobId };
};
