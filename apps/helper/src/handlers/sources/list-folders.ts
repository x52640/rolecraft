import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** sources.list_folders：列出已加入的資料夾。由 P1-T021 實作；接上前回 not_implemented，不偽造成功。 */
export const sourcesListFolders: OpHandler<'sources.list_folders'> = () =>
  Promise.resolve(notImplemented());
