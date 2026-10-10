import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { claimsFailure } from './failure.ts';

/** claims.list：列出某專案的事實項（含狀態與來源片段）。 */
export const claimsList: OpHandler<'claims.list'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  const claims = await services.claims.listClaims(payload.projectId);
  return claims === null ? claimsFailure('not_found') : { ok: true, claims };
};
