import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { draftRefused } from './failures.ts';

/** request_draft：只排入工作並回工作 ID；草稿不會自動送出（D7）。意圖不明等情況不排入、交回使用者。 */
export const requestDraft: OpHandler<'request_draft'> = async (payload, services) => {
  if (!services.messages) return notImplemented();
  const outcome = await services.messages.requestDraft(payload);
  if ('refused' in outcome) return draftRefused(outcome.refused);
  return { ok: true, workJobId: outcome.workJobId };
};
