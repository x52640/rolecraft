import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.start_login：開啟官方登入流程。由 P1-T030 實作；接上前回 not_implemented，不偽造成功。 */
export const providersStartLogin: OpHandler<'providers.start_login'> = () =>
  Promise.resolve(notImplemented());
