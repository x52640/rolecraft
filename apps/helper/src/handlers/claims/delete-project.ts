import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.delete_project：刪除專案；事實項回到未歸專案、本身不刪（D23）。 */
export const claimsDeleteProject: OpHandler<'claims.delete_project'> = async (
  payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.deleteProject(payload.projectId));
};
