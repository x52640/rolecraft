import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** jobs.get：取得單一快照。由 P1-T019 實作；接上前回 not_implemented，不偽造成功。 */
export const jobsGet: OpHandler<'jobs.get'> = () => Promise.resolve(notImplemented());
