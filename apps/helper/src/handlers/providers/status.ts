import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.status：三家最近一次檢查的狀態（不觸發新檢查）。 */
export const providersStatus: OpHandler<'providers.status'> = async (_payload, services) => {
  const service = services.providers;
  if (!service?.status) return notImplemented();
  return { ok: true, services: [...(await service.status())] };
};
