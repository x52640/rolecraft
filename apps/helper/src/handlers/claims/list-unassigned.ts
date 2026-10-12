import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.list_unassigned：列出未歸專案的事實項（含狀態與來源片段；D23）。 */
export const claimsListUnassigned: OpHandler<'claims.list_unassigned'> = async (
  _payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  return { ok: true, claims: await services.claims.listUnassigned() };
};
