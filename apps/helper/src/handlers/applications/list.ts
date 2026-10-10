import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** applications.list：列出投遞紀錄。由 P1-T028 實作；接上前回 not_implemented，不偽造成功。 */
export const applicationsList: OpHandler<'applications.list'> = () =>
  Promise.resolve(notImplemented());
