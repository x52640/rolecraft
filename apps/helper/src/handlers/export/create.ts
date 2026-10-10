import type { OpHandler } from '../handler.ts';
import { notImplemented } from '../services.ts';

/** export.create：匯出 PDF 並建立不可變匯出版本。由 P1-T040 實作；接上前回 not_implemented，不偽造成功。 */
export const exportCreate: OpHandler<'export.create'> = () => Promise.resolve(notImplemented());
