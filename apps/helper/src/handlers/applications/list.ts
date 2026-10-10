import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** applications.list：列出投遞紀錄。 */
export const applicationsList: OpHandler<'applications.list'> = async (_payload, services) => {
  const service = services.applications;
  if (!service?.list) return notImplemented();
  return { ok: true, applications: await service.list() };
};
