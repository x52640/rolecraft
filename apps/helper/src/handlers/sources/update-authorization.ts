import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.update_authorization：勾選授權／取消授權。由 P1-T021 實作；接上前回 not_implemented，不偽造成功。 */
export const sourcesUpdateAuthorization: OpHandler<'sources.update_authorization'> = () =>
  Promise.resolve(notImplemented());
