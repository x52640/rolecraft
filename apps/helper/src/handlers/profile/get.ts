import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { multipleProfiles } from './failures.ts';

/** profile.get（D28）：唯讀資料區唯一那份已確認的 Profile；沒有回 null，多份回固定原因。 */
export const profileGet: OpHandler<'profile.get'> = (_payload, services) => {
  const service = services.profile;
  if (!service?.get) return Promise.resolve(notImplemented());
  const outcome = service.get();
  if (!outcome.ok) return Promise.resolve(multipleProfiles());
  return Promise.resolve({ ok: true, profile: outcome.profile });
};
