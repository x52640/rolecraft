import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.update：修改事實項內容（既有確認失效）。由 P1-T023 實作；接上前回 not_implemented，不偽造成功。 */
export const claimsUpdate: OpHandler<'claims.update'> = () => Promise.resolve(notImplemented());
