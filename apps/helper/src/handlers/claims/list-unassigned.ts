import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/**
 * claims.list_unassigned：列出未歸專案的事實項（含狀態與來源片段；D23），
 * 附來源文件名稱（P1-T073）。
 */
export const claimsListUnassigned: OpHandler<'claims.list_unassigned'> = async (
  _payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  const claims = await services.claims.listUnassigned();
  return { ok: true, claims, sourceNames: await services.claims.sourceNames(claims) };
};
