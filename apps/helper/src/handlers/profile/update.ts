import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { profileUpdateRefused } from './failures.ts';

/**
 * profile.update（D30）：個人資料頁按儲存。比對基準版本號、依來源列搬移出處並標「已修改」、版本號加一；
 * 不符回 profile_conflict 且資料不動。成功回寫入後的整份已確認 Profile。
 */
export const profileUpdate: OpHandler<'profile.update'> = (payload, services) => {
  const service = services.profile;
  if (!service?.update) return Promise.resolve(notImplemented());
  const outcome = service.update(payload);
  if (!outcome.ok) return Promise.resolve(profileUpdateRefused(outcome.reason));
  return Promise.resolve({ ok: true, profile: outcome.profile });
};
