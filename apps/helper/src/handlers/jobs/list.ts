import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** jobs.list：列出職缺快照摘要（不含描述全文）。 */
export const jobsList: OpHandler<'jobs.list'> = async (_payload, services) => {
  if (!services.jobs?.list) return notImplemented();
  return { ok: true, snapshots: await services.jobs.list() };
};
