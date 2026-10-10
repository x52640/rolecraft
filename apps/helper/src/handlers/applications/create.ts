import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { rejected } from './rejections.ts';

/** applications.create：新增投遞紀錄（只是記錄，不代為投遞，D7）；實際投出版本只能是匯出版本（R3）。 */
export const applicationsCreate: OpHandler<'applications.create'> = async (payload, services) => {
  const service = services.applications;
  if (!service?.create) return notImplemented();
  const result = await service.create(payload);
  if (!result.ok) return rejected(result.reason);
  return { ok: true, applicationId: result.value.applicationId };
};
