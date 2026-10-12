import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.merge_projects：把一個專案併入另一個（事實項與文件移過去，來源專案刪除；D23）。 */
export const claimsMergeProjects: OpHandler<'claims.merge_projects'> = async (
  payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.mergeProjects(payload));
};
