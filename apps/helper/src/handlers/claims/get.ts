import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.get：取得單一事實項。由 P1-T023 實作；接上前回 not_implemented，不偽造成功。 */
export const claimsGet: OpHandler<'claims.get'> = () => Promise.resolve(notImplemented());
