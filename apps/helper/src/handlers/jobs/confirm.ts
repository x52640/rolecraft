import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** jobs.confirm：使用者確認快照。由 P1-T019 實作；接上前回 not_implemented，不偽造成功。 */
export const jobsConfirm: OpHandler<'jobs.confirm'> = () => Promise.resolve(notImplemented());
