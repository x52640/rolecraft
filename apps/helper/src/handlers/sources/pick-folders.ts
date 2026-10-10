import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.pick_folders：開系統資料夾選取器。由 P1-T021 實作；接上前回 not_implemented，不偽造成功。 */
export const sourcesPickFolders: OpHandler<'sources.pick_folders'> = () =>
  Promise.resolve(notImplemented());
