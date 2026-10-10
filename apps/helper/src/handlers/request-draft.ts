import type { RequestDraftRequest, RequestDraftResponse } from '@rolecraft/contracts';

import { notImplemented, type HelperServices } from './services.ts';

/** request_draft：只排入工作並回工作 ID；草稿不會自動送出（D7）。 */
export async function requestDraft(
  payload: RequestDraftRequest['payload'],
  services: HelperServices,
): Promise<RequestDraftResponse> {
  if (!services.draft) return notImplemented();
  const { workJobId } = await services.draft.request(payload);
  return { ok: true, workJobId };
}
