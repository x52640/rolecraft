import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.reject：否決（刪除）事實項，之後不得用於生成。 */
export const claimsReject: OpHandler<'claims.reject'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.reject(payload.claimId));
};
