import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.status：三家最近一次檢查的狀態（本程序尚未檢查過 Claude 時自動檢查一次，不呼叫模型）。 */
export const providersStatus: OpHandler<'providers.status'> = async (_payload, services) => {
  const service = services.providers;
  if (!service?.status) return notImplemented();
  return { ok: true, services: [...(await service.status())] };
};
