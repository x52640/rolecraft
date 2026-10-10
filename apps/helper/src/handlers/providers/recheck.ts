import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.recheck：重新檢查一家。由 P1-T030 實作；接上前回 not_implemented，不偽造成功。 */
export const providersRecheck: OpHandler<'providers.recheck'> = () =>
  Promise.resolve(notImplemented());
