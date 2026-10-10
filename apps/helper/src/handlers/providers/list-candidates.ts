import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.list_candidates：列出模型候選。由 P1-T030 實作；接上前回 not_implemented，不偽造成功。 */
export const providersListCandidates: OpHandler<'providers.list_candidates'> = () =>
  Promise.resolve(notImplemented());
