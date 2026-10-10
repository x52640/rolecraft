import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.update：修改事實項內容；既有使用者確認失效。 */
export const claimsUpdate: OpHandler<'claims.update'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.update(payload));
};
