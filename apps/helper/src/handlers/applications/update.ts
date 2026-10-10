import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { rejected } from './rejections.ts';

/** applications.update：修改起因、日期、狀態；實際投出版本不能改指向（R3）。 */
export const applicationsUpdate: OpHandler<'applications.update'> = async (payload, services) => {
  const service = services.applications;
  if (!service?.update) return notImplemented();
  const { applicationId, ...fields } = payload;
  const result = await service.update(applicationId, fields);
  if (!result.ok) return rejected(result.reason);
  return { ok: true };
};
