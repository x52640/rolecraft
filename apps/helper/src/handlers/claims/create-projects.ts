import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { ackOrFailure } from './failure.ts';

/** claims.create_projects：使用者確認分組後建立專案，並依歸屬規則歸入未歸專案的事實項（D23）。 */
export const claimsCreateProjects: OpHandler<'claims.create_projects'> = async (
  payload,
  services,
) => {
  if (!services.claims) return notImplemented();
  return ackOrFailure(await services.claims.createProjects(payload));
};
