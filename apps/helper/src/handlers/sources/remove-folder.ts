import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.remove_folder：移除資料夾並停止讀取。由 P1-T021 實作；接上前回 not_implemented，不偽造成功。 */
export const sourcesRemoveFolder: OpHandler<'sources.remove_folder'> = () =>
  Promise.resolve(notImplemented());
