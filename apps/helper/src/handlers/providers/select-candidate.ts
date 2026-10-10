import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/**
 * providers.select_candidate：選定候選並短驗證。candidateId 只拿來查 helper 自己配發的清單，
 * 查不到（含別家的 ID、模型名稱、路徑或旗標形狀的字串）一律 invalid_request，不回填請求內容；
 * 服務目前不是「可用」也回 invalid_request，不呼叫模型。
 */
export const providersSelectCandidate: OpHandler<'providers.select_candidate'> = async (
  payload,
  services,
) => {
  const service = services.providers;
  if (!service?.selectCandidate) return notImplemented();
  const result = await service.selectCandidate(payload.service, payload.candidateId);
  if (result.kind === 'unknown_candidate') {
    return { ok: false, error: { code: 'invalid_request', message: '找不到這個模型候選' } };
  }
  if (result.kind === 'not_available') {
    return {
      ok: false,
      error: { code: 'invalid_request', message: '服務目前不可用，請先重新檢查' },
    };
  }
  return { ok: true, verification: result.verification };
};
