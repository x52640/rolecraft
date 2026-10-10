import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** jobs.update：修改快照欄位（記為改過、清除確認）。由 P1-T019 實作；接上前回 not_implemented，不偽造成功。 */
export const jobsUpdate: OpHandler<'jobs.update'> = () => Promise.resolve(notImplemented());
