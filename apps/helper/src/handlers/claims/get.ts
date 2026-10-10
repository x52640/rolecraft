import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { claimsFailure } from './failure.ts';

/** claims.get：取得單一事實項。 */
export const claimsGet: OpHandler<'claims.get'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  const claim = await services.claims.getClaim(payload.claimId);
  return claim === null ? claimsFailure('not_found') : { ok: true, claim };
};
