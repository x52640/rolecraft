import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.rename_project：專案改名（D23）。 */
export const claimsRenameProject: OpHandler<'claims.rename_project'> = async (
  payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.renameProject(payload));
};
