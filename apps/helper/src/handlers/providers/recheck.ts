import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.recheck：重新檢查一家（安裝、登入、R5 版本閘門、R6）；Codex、Antigravity 首版回「尚未支援」。 */
export const providersRecheck: OpHandler<'providers.recheck'> = async (payload, services) => {
  const service = services.providers;
  if (!service?.recheck) return notImplemented();
  return { ok: true, status: await service.recheck(payload.service) };
};
