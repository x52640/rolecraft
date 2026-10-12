import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.move_claim：把事實項移到另一專案，或移回未歸專案（D23）。 */
export const claimsMoveClaim: OpHandler<'claims.move_claim'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.moveClaim(payload));
};
