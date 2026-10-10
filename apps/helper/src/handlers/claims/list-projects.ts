import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.list_projects：列出專案（摘要不帶確認狀態，R1）。 */
export const claimsListProjects: OpHandler<'claims.list_projects'> = async (_payload, services) => {
  if (!services.claims) return notImplemented();
  return { ok: true, projects: await services.claims.listProjects() };
};
