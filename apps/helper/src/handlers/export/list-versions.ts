import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.list_versions：列出匯出版本。由 P1-T040 實作；接上前回 not_implemented，不偽造成功。 */
export const exportListVersions: OpHandler<'export.list_versions'> = () =>
  Promise.resolve(notImplemented());
