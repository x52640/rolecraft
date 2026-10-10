import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.get_version：取得匯出版本。由 P1-T040 實作；接上前回 not_implemented，不偽造成功。 */
export const exportGetVersion: OpHandler<'export.get_version'> = () =>
  Promise.resolve(notImplemented());
