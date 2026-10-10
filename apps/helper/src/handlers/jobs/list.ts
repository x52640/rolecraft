import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** jobs.list：列出職缺快照摘要。由 P1-T019 實作；接上前回 not_implemented，不偽造成功。 */
export const jobsList: OpHandler<'jobs.list'> = () => Promise.resolve(notImplemented());
