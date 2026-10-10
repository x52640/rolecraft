import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** claims.confirm：確認事實項（記錄時間與當下文字）。由 P1-T023 實作；接上前回 not_implemented，不偽造成功。 */
export const claimsConfirm: OpHandler<'claims.confirm'> = () => Promise.resolve(notImplemented());
