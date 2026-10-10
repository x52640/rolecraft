import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.list_candidates：模型候選（ID 由 helper 配發＋顯示名稱）；尚未支援的服務回空清單。 */
export const providersListCandidates: OpHandler<'providers.list_candidates'> = async (
  payload,
  services,
) => {
  const service = services.providers;
  if (!service?.listCandidates) return notImplemented();
  return { ok: true, candidates: [...(await service.listCandidates(payload.service))] };
};
