import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { rejected } from './rejections.ts';

/** applications.delete：整筆刪除投遞紀錄（D19）。 */
export const applicationsDelete: OpHandler<'applications.delete'> = async (payload, services) => {
  const service = services.applications;
  if (!service?.delete) return notImplemented();
  const result = await service.delete(payload.applicationId);
  if (!result.ok) return rejected(result.reason);
  return { ok: true };
};
