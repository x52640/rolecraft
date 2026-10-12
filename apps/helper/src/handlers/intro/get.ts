import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';
import { introFailure } from './failures.ts';

/** intro.get：最近一份自介、依目前事實項重跑的檢查結果與最近一次產生狀態。 */
export const introGet: OpHandler<'intro.get'> = async ({ jobSnapshotId }, services) => {
  if (!services.intro?.get) return notImplemented();
  const details = await services.intro.get(jobSnapshotId);
  return details ? { ok: true, ...details } : introFailure('not_found');
};
