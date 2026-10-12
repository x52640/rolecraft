import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { claimsFailure } from './failure.ts';

/** claims.list：列出某專案的事實項（含狀態與來源片段），附來源文件名稱（P1-T073）。 */
export const claimsList: OpHandler<'claims.list'> = async (payload, services) => {
  if (!services.claims) return notImplemented();
  const claims = await services.claims.listClaims(payload.projectId);
  if (claims === null) return claimsFailure('not_found');
  return { ok: true, claims, sourceNames: await services.claims.sourceNames(claims) };
};
