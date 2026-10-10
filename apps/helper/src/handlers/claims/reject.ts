import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.reject：否決事實項。由 P1-T023 實作；接上前回 not_implemented，不偽造成功。 */
export const claimsReject: OpHandler<'claims.reject'> = () => Promise.resolve(notImplemented());
