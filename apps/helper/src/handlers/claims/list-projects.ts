import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.list_projects：列出專案。由 P1-T023 實作；接上前回 not_implemented，不偽造成功。 */
export const claimsListProjects: OpHandler<'claims.list_projects'> = () =>
  Promise.resolve(notImplemented());
