import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { invalidEntry, unknownRoot } from './failures.ts';

/**
 * sources.update_authorization：勾選授權／取消授權。只接受該資料夾最近一次預覽回過的文件；
 * 任一項不合法就整筆不套用。取消後立即停止讀取（R4）。
 */
export const sourcesUpdateAuthorization: OpHandler<'sources.update_authorization'> = (
  payload,
  services,
) => {
  const service = services.sources;
  if (!service?.updateAuthorization) return Promise.resolve(notImplemented());
  const result = service.updateAuthorization(payload.rootId, payload.authorize, payload.revoke);
  if (result === 'unknown_root') return Promise.resolve(unknownRoot());
  if (result === 'invalid_entry') return Promise.resolve(invalidEntry());
  return Promise.resolve({ ok: true });
};
