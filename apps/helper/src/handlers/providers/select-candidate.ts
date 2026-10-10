import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.select_candidate：選定候選並短驗證。由 P1-T030 實作；接上前回 not_implemented，不偽造成功。 */
export const providersSelectCandidate: OpHandler<'providers.select_candidate'> = () =>
  Promise.resolve(notImplemented());
