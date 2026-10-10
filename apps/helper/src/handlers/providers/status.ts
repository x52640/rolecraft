import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** providers.status：三家最近一次檢查狀態。由 P1-T030 實作；接上前回 not_implemented，不偽造成功。 */
export const providersStatus: OpHandler<'providers.status'> = () =>
  Promise.resolve(notImplemented());
